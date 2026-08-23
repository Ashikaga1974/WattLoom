from fastapi import APIRouter
from pydantic import BaseModel

from backend.api.errors import api_error
from backend.database import db_connection
from backend.licensing.state import activate_license, get_license_status

router = APIRouter(prefix="/license", tags=["license"])


class ActivateRequest(BaseModel):
    license_key: str


@router.get("/status")
def license_status():
    with db_connection() as conn:
        status = get_license_status(conn)
    return {
        "licensed": status.licensed,
        "customer": status.customer,
        "trial_days_left": status.trial_days_left,
        "trial_end_date": status.trial_end_date,
        "access": status.licensed or status.trial_days_left > 0,
    }


@router.post("/activate")
def activate(body: ActivateRequest):
    with db_connection() as conn:
        status = activate_license(conn, body.license_key)
    if status is None:
        raise api_error(400, "invalid_license_key", "Lizenzschlüssel ist ungültig")
    return {"licensed": status.licensed, "customer": status.customer}
