"""Battery module placeholder router."""

from fastapi import APIRouter

from app.core.dependencies import CurrentUser
from app.schemas.common import ModuleStatusResponse
from app.services.module_service import module_status

router = APIRouter(prefix="/battery", tags=["Battery"])


@router.get(
    "/status",
    response_model=ModuleStatusResponse,
    summary="Battery module status (placeholder)",
)
def status(current_user: CurrentUser) -> ModuleStatusResponse:
    return module_status("battery")
