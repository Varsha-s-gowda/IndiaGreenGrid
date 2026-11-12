"""Validated document upload and download endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, File, Form, Query, UploadFile, status
from fastapi.responses import FileResponse

from app.core.dependencies import CurrentUser, DbSession
from app.services import document_service

router = APIRouter(prefix="/documents", tags=["Documents"])


@router.post(
    "/upload",
    status_code=status.HTTP_201_CREATED,
    summary="Upload a supporting document",
)
async def upload_document(
    db: DbSession,
    current_user: CurrentUser,
    entity_type: Annotated[str, Form(max_length=40)],
    entity_id: Annotated[int, Form(ge=1)],
    document_type: Annotated[str, Form(max_length=80)] = "SUPPORTING",
    file: Annotated[UploadFile, File(description="PDF, image or office document up to 10 MB")] = ...,
) -> dict:
    return await document_service.upload_document(
        db,
        current_user,
        entity_type=entity_type,
        entity_id=entity_id,
        document_type=document_type,
        upload=file,
    )


@router.get("", summary="List documents attached to a record")
def list_documents(
    db: DbSession,
    current_user: CurrentUser,
    entity_type: Annotated[str, Query(max_length=40)],
    entity_id: Annotated[int, Query(ge=1)],
) -> dict:
    return {
        "items": document_service.list_documents(
            db, current_user, entity_type=entity_type.upper(), entity_id=entity_id
        )
    }


@router.get("/{document_id}/download", summary="Download a document you are allowed to view")
def download_document(
    document_id: int, db: DbSession, current_user: CurrentUser
) -> FileResponse:
    path, document = document_service.get_download(db, current_user, document_id)
    return FileResponse(
        path,
        media_type=document.content_type,
        filename=document.file_name,
    )


@router.post("/{document_id}/review", summary="Accept or reject an uploaded document")
def review_document(
    document_id: int,
    db: DbSession,
    current_user: CurrentUser,
    status_value: Annotated[str, Query(alias="status", max_length=20)] = "ACCEPTED",
    note: Annotated[str, Query(max_length=2000)] = "",
) -> dict:
    return document_service.review_document(
        db, current_user, document_id, status=status_value, note=note
    )
