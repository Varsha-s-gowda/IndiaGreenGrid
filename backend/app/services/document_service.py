"""Validated document uploads and access control."""

from __future__ import annotations

import re
import uuid
from pathlib import Path
from typing import Any

from fastapi import UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestError, ForbiddenError, NotFoundError
from app.models.ecosystem import (
    ApplicationDocument,
    GreenLoanApplication,
    OrganisationProfile,
    RecyclingRequest,
    RenewableProcurementRequest,
    SolarInstallation,
    SolarInstallationRequest,
    SupplierQuotation,
)
from app.models.user import User, UserRole

UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads"
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
ALLOWED_EXTENSIONS = {
    ".pdf": {"application/pdf"},
    ".png": {"image/png"},
    ".jpg": {"image/jpeg"},
    ".jpeg": {"image/jpeg"},
    ".webp": {"image/webp"},
    ".doc": {"application/msword"},
    ".docx": {
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    },
    ".xlsx": {
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    },
}

ENTITY_TYPES = {
    "ORGANISATION",
    "SOLAR_REQUEST",
    "SOLAR_INSTALLATION",
    "LOAN_APPLICATION",
    "RECYCLING_REQUEST",
    "PROCUREMENT_REQUEST",
}


def _safe_name(filename: str | None) -> str:
    name = Path(filename or "document").name
    name = re.sub(r"[^A-Za-z0-9._-]+", "_", name).strip("._")
    return name[:180] or "document"


def _entity(db: Session, entity_type: str, entity_id: int):
    if entity_type == "ORGANISATION":
        entity = db.get(OrganisationProfile, entity_id)
        label = "Organisation"
    elif entity_type == "SOLAR_REQUEST":
        entity = db.get(SolarInstallationRequest, entity_id)
        label = "Solar request"
    elif entity_type == "SOLAR_INSTALLATION":
        entity = db.get(SolarInstallation, entity_id)
        label = "Installation"
    elif entity_type == "LOAN_APPLICATION":
        entity = db.get(GreenLoanApplication, entity_id)
        label = "Loan application"
    elif entity_type == "RECYCLING_REQUEST":
        entity = db.get(RecyclingRequest, entity_id)
        label = "Recycling request"
    elif entity_type == "PROCUREMENT_REQUEST":
        entity = db.get(RenewableProcurementRequest, entity_id)
        label = "Procurement request"
    else:
        raise BadRequestError("Unsupported document entity type.")
    if entity is None:
        raise NotFoundError(f"{label} was not found.")
    return entity


def _entity_user_ids(db: Session, entity_type: str, entity) -> set[int]:
    if entity_type == "ORGANISATION":
        return {entity.owner_id}
    if entity_type in {"SOLAR_REQUEST", "SOLAR_INSTALLATION"}:
        ids = {entity.citizen_id, entity.installer_id}
        return {value for value in ids if value}
    if entity_type == "LOAN_APPLICATION":
        return {entity.citizen_id, entity.institution_id}
    if entity_type == "RECYCLING_REQUEST":
        return {value for value in (entity.citizen_id, entity.recycler_id) if value}
    if entity_type == "PROCUREMENT_REQUEST":
        ids = {entity.discom_id}
        ids.update(
            db.scalars(
                select(SupplierQuotation.supplier_id).where(
                    SupplierQuotation.request_id == entity.id
                )
            ).all()
        )
        return ids
    return set()


def can_access_entity(db: Session, user: User, entity_type: str, entity_id: int) -> bool:
    if user.role == UserRole.ADMIN:
        return True
    entity = _entity(db, entity_type, entity_id)
    return user.id in _entity_user_ids(db, entity_type, entity)


def serialise(document: ApplicationDocument) -> dict[str, Any]:
    return {
        "id": document.id,
        "entity_type": document.entity_type,
        "entity_id": document.entity_id,
        "owner_id": document.owner_id,
        "document_type": document.document_type,
        "file_name": document.file_name,
        "content_type": document.content_type,
        "size_bytes": document.size_bytes,
        "status": document.status,
        "note": document.note,
        "download_url": f"/api/documents/{document.id}/download",
        "uploaded_at": document.created_at.isoformat() if document.created_at else None,
    }


def list_documents(
    db: Session, user: User, *, entity_type: str, entity_id: int
) -> list[dict[str, Any]]:
    if not can_access_entity(db, user, entity_type, entity_id):
        raise ForbiddenError("You cannot access documents for this record.")
    documents = db.scalars(
        select(ApplicationDocument)
        .where(
            ApplicationDocument.entity_type == entity_type,
            ApplicationDocument.entity_id == entity_id,
        )
        .order_by(ApplicationDocument.created_at.desc())
    ).all()
    return [serialise(document) for document in documents]


async def upload_document(
    db: Session,
    user: User,
    *,
    entity_type: str,
    entity_id: int,
    document_type: str,
    upload: UploadFile,
) -> dict[str, Any]:
    entity_type = entity_type.upper()
    if entity_type not in ENTITY_TYPES:
        raise BadRequestError("Unsupported document entity type.")
    if not can_access_entity(db, user, entity_type, entity_id):
        raise ForbiddenError("You cannot upload documents for this record.")

    original_name = _safe_name(upload.filename)
    extension = Path(original_name).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise BadRequestError(
            "Unsupported file type.",
            details={"allowed_extensions": sorted(ALLOWED_EXTENSIONS)},
        )

    content_type = (upload.content_type or "").lower()
    allowed_types = ALLOWED_EXTENSIONS[extension]
    if content_type and content_type != "application/octet-stream" and content_type not in allowed_types:
        raise BadRequestError(
            "The uploaded file content type does not match its extension.",
            details={"extension": extension, "content_type": content_type},
        )

    payload = await upload.read(MAX_UPLOAD_BYTES + 1)
    if not payload:
        raise BadRequestError("The uploaded file is empty.")
    if len(payload) > MAX_UPLOAD_BYTES:
        raise BadRequestError(
            "The uploaded file is too large.",
            details={"max_size_bytes": MAX_UPLOAD_BYTES},
        )

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    stored_name = f"{uuid.uuid4().hex}{extension}"
    destination = UPLOAD_DIR / stored_name
    destination.write_bytes(payload)

    document = ApplicationDocument(
        entity_type=entity_type,
        entity_id=entity_id,
        owner_id=user.id,
        document_type=(document_type or "SUPPORTING")[:80],
        file_name=original_name,
        stored_name=stored_name,
        content_type=content_type or sorted(allowed_types)[0],
        size_bytes=len(payload),
        file_path=str(destination),
        status="UPLOADED",
    )
    db.add(document)
    db.commit()
    db.refresh(document)
    return serialise(document)


def get_download(db: Session, user: User, document_id: int) -> tuple[Path, ApplicationDocument]:
    document = db.get(ApplicationDocument, document_id)
    if document is None:
        raise NotFoundError("Document was not found.")
    if not can_access_entity(db, user, document.entity_type, document.entity_id):
        raise ForbiddenError("You cannot access this document.")
    path = Path(document.file_path)
    if not path.is_file():
        raise NotFoundError("The stored document is no longer available.")
    return path, document


def review_document(
    db: Session, user: User, document_id: int, *, status: str, note: str = ""
) -> dict[str, Any]:
    if status not in {"ACCEPTED", "REJECTED", "UPLOADED"}:
        raise BadRequestError("Unsupported document review status.")
    document = db.get(ApplicationDocument, document_id)
    if document is None:
        raise NotFoundError("Document was not found.")
    if user.role != UserRole.ADMIN:
        if not can_access_entity(db, user, document.entity_type, document.entity_id):
            raise ForbiddenError("You cannot review this document.")
        if document.owner_id == user.id and user.role not in {UserRole.ADMIN}:
            raise ForbiddenError("You cannot review your own uploaded document.")
    document.status = status
    document.note = note
    db.commit()
    db.refresh(document)
    return serialise(document)
