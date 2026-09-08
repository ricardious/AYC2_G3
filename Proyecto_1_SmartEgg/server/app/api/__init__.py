from fastapi import APIRouter

from . import access, auth, door_events, incubation, nodes, reports, telemetry

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(access.router)
api_router.include_router(nodes.router)
api_router.include_router(incubation.router)
api_router.include_router(telemetry.router)
api_router.include_router(door_events.router)
api_router.include_router(reports.router)
