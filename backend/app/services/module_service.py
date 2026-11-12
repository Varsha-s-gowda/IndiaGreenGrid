"""Placeholder module metadata shared by the stub routers."""

from __future__ import annotations

from app.schemas.common import ModuleStatusResponse

MODULE_DESCRIPTIONS = {
    "simulation": "Shared rooftop solar generation simulation.",
    "allocation": "Fair-share distribution of solar electricity to apartments.",
    "billing": "Transparent savings calculation and monthly billing.",
    "roofmax": "Rooftop area optimisation and panel layout planning.",
    "meterguard": "Meter anomaly detection and usage integrity checks.",
    "battery": "Battery storage sizing, dispatch and state-of-charge tracking.",
}


def module_status(module: str, *, admin: bool = False) -> ModuleStatusResponse:
    description = MODULE_DESCRIPTIONS.get(module, "Planned SolarEquity 360 module.")
    suffix = " Admin controls are reserved for the ADMIN role." if admin else ""
    return ModuleStatusResponse(
        module=module,
        message=(
            f"{description} The API surface is registered but the algorithms "
            f"are intentionally not implemented in this foundation release.{suffix}"
        ),
    )
