"""Citizen <-> financial institution green-loan marketplace."""

from __future__ import annotations

from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestError, ConflictError, ForbiddenError, NotFoundError
from app.models.ecosystem import GreenLoanApplication, GreenLoanProduct, OrganisationProfile
from app.models.user import User, UserRole
from app.schemas.ecosystem import (
    LoanApplicationCreate,
    LoanDecision,
    LoanProductCreate,
    LoanProductUpdate,
)
from app.services.audit_service import record_audit
from app.services.ecosystem_common import (
    get_organisation,
    make_reference,
    notify,
    paginate,
    require_organisation,
    user_brief,
    utcnow,
)

LOAN_APPLICATION_TRANSITIONS = {
    "SUBMITTED": {"UNDER_REVIEW", "DOCUMENTS_REQUESTED", "APPROVED", "REJECTED", "WITHDRAWN"},
    "UNDER_REVIEW": {"DOCUMENTS_REQUESTED", "APPROVED", "REJECTED", "WITHDRAWN"},
    "DOCUMENTS_REQUESTED": {
        "DOCUMENTS_RESUBMITTED",
        "UNDER_REVIEW",
        "REJECTED",
        "WITHDRAWN",
    },
    "DOCUMENTS_RESUBMITTED": {
        "UNDER_REVIEW",
        "DOCUMENTS_REQUESTED",
        "APPROVED",
        "REJECTED",
        "WITHDRAWN",
    },
    "APPROVED": set(),
    "REJECTED": set(),
    "WITHDRAWN": set(),
}


def serialise_product(product: GreenLoanProduct, *, include_institution: bool = True) -> dict[str, Any]:
    data = {
        "id": product.id,
        "institution_id": product.institution_id,
        "organisation_id": product.organisation_id,
        "name": product.name,
        "description": product.description,
        "interest_rate_min": product.interest_rate_min,
        "interest_rate_max": product.interest_rate_max,
        "min_amount": product.min_amount,
        "max_amount": product.max_amount,
        "tenure_months_min": product.tenure_months_min,
        "tenure_months_max": product.tenure_months_max,
        "eligibility": product.eligibility,
        "required_documents": product.required_documents,
        "processing_fee_pct": product.processing_fee_pct,
        "is_active": product.is_active,
        "status": product.status,
        "created_at": product.created_at.isoformat() if product.created_at else None,
        "updated_at": product.updated_at.isoformat() if product.updated_at else None,
    }
    if include_institution:
        data["institution"] = user_brief(getattr(product, "institution", None))
        data["organisation_name"] = getattr(getattr(product, "organisation", None), "name", None)
    return data


def serialise_application(application: GreenLoanApplication) -> dict[str, Any]:
    product = application.product
    return {
        "id": application.id,
        "reference": application.reference,
        "product_id": application.product_id,
        "product": serialise_product(product, include_institution=False) if product else None,
        "product_name": product.name if product else None,
        "citizen_id": application.citizen_id,
        "citizen": user_brief(getattr(application, "citizen", None)),
        "institution_id": application.institution_id,
        "institution": user_brief(getattr(application, "institution", None)),
        "loan_amount": application.loan_amount,
        "project_purpose": application.project_purpose,
        "location": application.location,
        "state": application.state,
        "status": application.status,
        "review_note": application.review_note,
        "decision_note": application.decision_note,
        "submitted_at": application.submitted_at.isoformat() if application.submitted_at else None,
        "reviewed_at": application.reviewed_at.isoformat() if application.reviewed_at else None,
        "decided_at": application.decided_at.isoformat() if application.decided_at else None,
        "created_at": application.created_at.isoformat() if application.created_at else None,
        "updated_at": application.updated_at.isoformat() if application.updated_at else None,
    }


def _institution_profile(db: Session, user: User) -> OrganisationProfile:
    return require_organisation(db, user, require_verified=True)


def _validate_product(payload: LoanProductCreate | LoanProductUpdate, existing: dict | None = None) -> None:
    data = payload.model_dump(exclude_unset=True)
    values = dict(existing or {})
    values.update({key: value for key, value in data.items() if value is not None})
    if values.get("max_amount") is not None and values.get("min_amount") is not None:
        if values["max_amount"] < values["min_amount"]:
            raise BadRequestError("Maximum loan amount must be at least the minimum amount.")
    if values.get("interest_rate_max") is not None and values.get("interest_rate_min") is not None:
        if values["interest_rate_max"] < values["interest_rate_min"]:
            raise BadRequestError("Maximum interest rate must be at least the minimum rate.")
    if values.get("tenure_months_max") is not None and values.get("tenure_months_min") is not None:
        if values["tenure_months_max"] < values["tenure_months_min"]:
            raise BadRequestError("Maximum tenure must be at least the minimum tenure.")


def create_product(db: Session, user: User, payload: LoanProductCreate) -> dict[str, Any]:
    if user.role != UserRole.FINANCIAL_INSTITUTION:
        raise ForbiddenError("Only financial institutions can create loan products.")
    profile = _institution_profile(db, user)
    _validate_product(payload)
    existing = db.scalar(
        select(GreenLoanProduct).where(
            GreenLoanProduct.institution_id == user.id,
            GreenLoanProduct.name == payload.name,
        )
    )
    if existing is not None:
        raise ConflictError("A loan product with this name already exists.")
    is_active = bool(payload.is_active)
    product = GreenLoanProduct(
        institution_id=user.id,
        organisation_id=profile.id,
        name=payload.name,
        description=payload.description,
        interest_rate_min=payload.interest_rate_min,
        interest_rate_max=payload.interest_rate_max,
        min_amount=payload.min_amount,
        max_amount=payload.max_amount,
        tenure_months_min=payload.tenure_months_min,
        tenure_months_max=payload.tenure_months_max,
        eligibility=payload.eligibility,
        required_documents=payload.required_documents,
        processing_fee_pct=payload.processing_fee_pct,
        is_active=is_active,
        status="ACTIVE" if is_active else "DRAFT",
    )
    db.add(product)
    record_audit(
        db,
        user,
        action="LOAN_PRODUCT_CREATED",
        module="loans",
        entity_type="LOAN_PRODUCT",
        entity_id=None,
        description=f"Loan product {payload.name} created.",
        commit=False,
    )
    db.commit()
    db.refresh(product)
    return serialise_product(product)


def update_product(
    db: Session, user: User, product_id: int, payload: LoanProductUpdate
) -> dict[str, Any]:
    product = db.get(GreenLoanProduct, product_id)
    if product is None:
        raise NotFoundError("Loan product was not found.")
    if product.institution_id != user.id and user.role != UserRole.ADMIN:
        raise ForbiddenError("You can only manage your own loan products.")
    if user.role != UserRole.ADMIN:
        _institution_profile(db, user)
    existing = {
        "min_amount": product.min_amount,
        "max_amount": product.max_amount,
        "interest_rate_min": product.interest_rate_min,
        "interest_rate_max": product.interest_rate_max,
        "tenure_months_min": product.tenure_months_min,
        "tenure_months_max": product.tenure_months_max,
    }
    _validate_product(payload, existing)
    data = payload.model_dump(exclude_unset=True)
    if "is_active" in data:
        if data["is_active"] and user.role != UserRole.ADMIN:
            _institution_profile(db, user)
    for field, value in data.items():
        if field == "is_active":
            continue
        if value is not None:
            setattr(product, field, value)
    if "is_active" in data:
        product.is_active = bool(data["is_active"])
        product.status = "ACTIVE" if product.is_active else "INACTIVE"
    record_audit(
        db,
        user,
        action="LOAN_PRODUCT_UPDATED",
        module="loans",
        entity_type="LOAN_PRODUCT",
        entity_id=product.id,
        description="Loan product updated.",
        commit=False,
    )
    db.commit()
    db.refresh(product)
    return serialise_product(product)


def list_products(
    db: Session,
    user: User,
    *,
    mine: bool = False,
    search: str | None = None,
    active_only: bool = True,
    page: int = 1,
    page_size: int = 20,
) -> dict[str, Any]:
    stmt = select(GreenLoanProduct)
    if mine:
        if user.role not in {UserRole.FINANCIAL_INSTITUTION, UserRole.ADMIN}:
            raise ForbiddenError("You cannot access institution loan products.")
        if user.role == UserRole.FINANCIAL_INSTITUTION:
            stmt = stmt.where(GreenLoanProduct.institution_id == user.id)
    else:
        stmt = stmt.join(
            OrganisationProfile,
            GreenLoanProduct.organisation_id == OrganisationProfile.id,
        ).where(
            OrganisationProfile.verification_status == "VERIFIED",
            OrganisationProfile.is_suspended.is_(False),
        )
        if active_only:
            stmt = stmt.where(GreenLoanProduct.is_active.is_(True))
    if search:
        pattern = f"%{search.strip()}%"
        if mine:
            stmt = stmt.where(
                or_(
                    GreenLoanProduct.name.ilike(pattern),
                    GreenLoanProduct.description.ilike(pattern),
                )
            )
        else:
            stmt = stmt.where(
                or_(
                    GreenLoanProduct.name.ilike(pattern),
                    GreenLoanProduct.description.ilike(pattern),
                    OrganisationProfile.name.ilike(pattern),
                )
            )
    stmt = stmt.order_by(GreenLoanProduct.interest_rate_min.asc(), GreenLoanProduct.name.asc())
    result = paginate(stmt, db, page=page, page_size=page_size)
    result["items"] = [serialise_product(item) for item in result["items"]]
    return result


def create_application(
    db: Session, user: User, payload: LoanApplicationCreate
) -> dict[str, Any]:
    if user.role not in {UserRole.CITIZEN, UserRole.RESIDENT, UserRole.INDUSTRY}:
        raise ForbiddenError("Only citizen accounts can apply for green loans.")
    product = db.get(GreenLoanProduct, payload.product_id)
    if product is None or not product.is_active:
        raise NotFoundError("The selected loan product is not available.")
    profile = db.get(OrganisationProfile, product.organisation_id) if product.organisation_id else None
    if profile is None or profile.verification_status != "VERIFIED" or profile.is_suspended:
        raise BadRequestError("This loan product is not currently offered by a verified institution.")
    if payload.loan_amount < product.min_amount or payload.loan_amount > product.max_amount:
        raise BadRequestError(
            "The requested amount is outside this product's range.",
            details={"min_amount": product.min_amount, "max_amount": product.max_amount},
        )
    application = GreenLoanApplication(
        reference=make_reference("LOAN"),
        product_id=product.id,
        citizen_id=user.id,
        institution_id=product.institution_id,
        loan_amount=payload.loan_amount,
        project_purpose=payload.project_purpose.strip(),
        location=payload.location.strip(),
        state=payload.state.strip(),
        status="SUBMITTED",
    )
    db.add(application)
    db.flush()
    notify(
        db,
        product.institution_id,
        title="New green loan application",
        message=f"₹{payload.loan_amount:,.0f} for {payload.project_purpose}.",
        category="FINANCE",
        link="/financier/applications",
        entity_type="LOAN_APPLICATION",
        entity_id=application.id,
    )
    record_audit(
        db,
        user,
        action="LOAN_APPLICATION_SUBMITTED",
        module="loans",
        entity_type="LOAN_APPLICATION",
        entity_id=application.id,
        description=f"Application for {product.name}.",
        commit=False,
    )
    db.commit()
    db.refresh(application)
    return serialise_application(application)


def _load_application(db: Session, application_id: int) -> GreenLoanApplication:
    application = db.get(GreenLoanApplication, application_id)
    if application is None:
        raise NotFoundError("Loan application was not found.")
    return application


def _notify_application(db: Session, application: GreenLoanApplication, title: str, message: str) -> None:
    notify(
        db,
        application.citizen_id,
        title=title,
        message=message,
        category="FINANCE",
        link="/citizen/loan-applications",
        entity_type="LOAN_APPLICATION",
        entity_id=application.id,
    )


def list_applications(
    db: Session,
    user: User,
    *,
    status: str | None = None,
    search: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> dict[str, Any]:
    stmt = select(GreenLoanApplication)
    if user.role in {UserRole.CITIZEN, UserRole.RESIDENT, UserRole.INDUSTRY}:
        stmt = stmt.where(GreenLoanApplication.citizen_id == user.id)
    elif user.role == UserRole.FINANCIAL_INSTITUTION:
        stmt = stmt.where(GreenLoanApplication.institution_id == user.id)
    elif user.role == UserRole.ADMIN:
        pass
    elif user.role == UserRole.POLICYMAKER:
        stmt = stmt.where(GreenLoanApplication.status == "APPROVED")
    else:
        raise ForbiddenError("You cannot access loan applications.")
    if status:
        stmt = stmt.where(GreenLoanApplication.status == status)
    if search:
        pattern = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                GreenLoanApplication.reference.ilike(pattern),
                GreenLoanApplication.project_purpose.ilike(pattern),
                GreenLoanApplication.location.ilike(pattern),
            )
        )
    stmt = stmt.order_by(GreenLoanApplication.created_at.desc())
    result = paginate(stmt, db, page=page, page_size=page_size)
    result["items"] = [serialise_application(item) for item in result["items"]]
    return result


def get_application(db: Session, user: User, application_id: int) -> dict[str, Any]:
    application = _load_application(db, application_id)
    if user.role == UserRole.ADMIN:
        pass
    elif user.role in {UserRole.CITIZEN, UserRole.RESIDENT, UserRole.INDUSTRY}:
        if application.citizen_id != user.id:
            raise ForbiddenError("You cannot access this loan application.")
    elif user.role == UserRole.FINANCIAL_INSTITUTION:
        if application.institution_id != user.id:
            raise ForbiddenError("You cannot access this loan application.")
    elif user.role == UserRole.POLICYMAKER:
        if application.status != "APPROVED":
            raise ForbiddenError("Aggregated loan data is limited to approved applications.")
    else:
        raise ForbiddenError("You cannot access this loan application.")
    return serialise_application(application)


def decide_application(
    db: Session, user: User, application_id: int, payload: LoanDecision
) -> dict[str, Any]:
    application = _load_application(db, application_id)
    if user.role not in {UserRole.FINANCIAL_INSTITUTION, UserRole.ADMIN}:
        raise ForbiddenError("Only financial institutions can review loan applications.")
    if user.role == UserRole.FINANCIAL_INSTITUTION:
        _institution_profile(db, user)
        if application.institution_id != user.id:
            raise ForbiddenError("This application does not belong to your institution.")
    target = payload.status
    if target not in LOAN_APPLICATION_TRANSITIONS.get(application.status, set()):
        raise BadRequestError(
            f"Cannot move loan application from {application.status} to {target}."
        )
    if target in {"APPROVED", "REJECTED"} and not payload.note.strip():
        raise BadRequestError("A decision note is required for approvals and rejections.")
    application.status = target
    application.review_note = payload.note
    if target == "DOCUMENTS_REQUESTED":
        application.reviewed_at = utcnow()
    if target in {"APPROVED", "REJECTED"}:
        application.decided_at = utcnow()
        application.decision_note = payload.note
    label = target.replace("_", " ").lower()
    _notify_application(
        db,
        application,
        "Green loan application update",
        f"{application.reference} is now {label}.",
    )
    record_audit(
        db,
        user,
        action="LOAN_APPLICATION_DECIDED",
        module="loans",
        entity_type="LOAN_APPLICATION",
        entity_id=application.id,
        description=f"Decision {target}: {payload.note}",
        commit=False,
    )
    db.commit()
    db.refresh(application)
    return serialise_application(application)


def resubmit_application(db: Session, user: User, application_id: int) -> dict[str, Any]:
    from app.models.ecosystem import ApplicationDocument

    application = _load_application(db, application_id)
    if user.role not in {UserRole.CITIZEN, UserRole.RESIDENT, UserRole.INDUSTRY}:
        raise ForbiddenError("Only the applicant can resubmit documents.")
    if application.citizen_id != user.id:
        raise ForbiddenError("You cannot access this loan application.")
    if application.status not in {"DOCUMENTS_REQUESTED", "SUBMITTED"}:
        raise BadRequestError("Documents are not currently requested for this application.")
    documents = db.scalar(
        select(ApplicationDocument.id).where(
            ApplicationDocument.entity_type == "LOAN_APPLICATION",
            ApplicationDocument.entity_id == application.id,
        )
    )
    if documents is None:
        raise BadRequestError("Upload at least one supporting document before resubmitting.")
    application.status = "DOCUMENTS_RESUBMITTED"
    application.reviewed_at = utcnow()
    notify(
        db,
        application.institution_id,
        title="Loan documents resubmitted",
        message=f"Applicant resubmitted documents for {application.reference}.",
        category="FINANCE",
        link="/financier/applications",
        entity_type="LOAN_APPLICATION",
        entity_id=application.id,
    )
    record_audit(
        db,
        user,
        action="LOAN_DOCUMENTS_RESUBMITTED",
        module="loans",
        entity_type="LOAN_APPLICATION",
        entity_id=application.id,
        description="Applicant resubmitted supporting documents.",
        commit=False,
    )
    db.commit()
    db.refresh(application)
    return serialise_application(application)


def withdraw_application(db: Session, user: User, application_id: int) -> dict[str, Any]:
    application = _load_application(db, application_id)
    if application.citizen_id != user.id and user.role != UserRole.ADMIN:
        raise ForbiddenError("Only the applicant can withdraw this application.")
    if "WITHDRAWN" not in LOAN_APPLICATION_TRANSITIONS.get(application.status, set()):
        raise BadRequestError("This application can no longer be withdrawn.")
    application.status = "WITHDRAWN"
    notify(
        db,
        application.institution_id,
        title="Loan application withdrawn",
        message=f"{application.reference} was withdrawn by the applicant.",
        category="FINANCE",
        link="/financier/applications",
        entity_type="LOAN_APPLICATION",
        entity_id=application.id,
    )
    record_audit(
        db,
        user,
        action="LOAN_APPLICATION_WITHDRAWN",
        module="loans",
        entity_type="LOAN_APPLICATION",
        entity_id=application.id,
        description="Application withdrawn by applicant.",
        commit=False,
    )
    db.commit()
    db.refresh(application)
    return serialise_application(application)


def institution_summary(db: Session, user: User) -> dict[str, Any]:
    if user.role not in {UserRole.FINANCIAL_INSTITUTION, UserRole.ADMIN}:
        raise ForbiddenError("You cannot access institution loan analytics.")
    stmt = select(GreenLoanApplication)
    if user.role == UserRole.FINANCIAL_INSTITUTION:
        stmt = stmt.where(GreenLoanApplication.institution_id == user.id)
    applications = db.scalars(stmt).all()
    products = db.scalars(
        select(GreenLoanProduct).where(
            GreenLoanProduct.institution_id == user.id
            if user.role == UserRole.FINANCIAL_INSTITUTION
            else GreenLoanProduct.id.isnot(None)
        )
    ).all()
    by_status: dict[str, int] = {}
    for application in applications:
        by_status[application.status] = by_status.get(application.status, 0) + 1
    return {
        "products": len(products),
        "active_products": sum(1 for product in products if product.is_active),
        "applications": len(applications),
        "by_status": by_status,
        "requested_amount": round(sum(a.loan_amount for a in applications), 2),
        "approved_amount": round(
            sum(a.loan_amount for a in applications if a.status == "APPROVED"), 2
        ),
    }
