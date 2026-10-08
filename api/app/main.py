import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routers import (
    billing,
    inventory,
    jobs,
    meal_plan,
    profiles,
    search,
    shopping,
)

# Les réponses d'erreur ne portent plus le détail technique : il ne reste que
# le journal pour savoir ce qui a réellement échoué. Sur Cloud Run, stderr est
# collecté par Cloud Logging, donc la configuration par défaut suffit — mais
# sans cet appel, le niveau WARNING masquerait tout ce qui est en dessous.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

app = FastAPI(title="SmartChef AI API")

# The Expo web build runs on a different port than the API, so every browser
# call is cross-origin. Native builds don't enforce CORS, but the web one does.
# Origins are configurable so production doesn't inherit the dev allowlist.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(profiles.router)
app.include_router(inventory.router)
app.include_router(jobs.router)
app.include_router(search.router)
app.include_router(meal_plan.router)
app.include_router(shopping.router)
app.include_router(billing.router)


@app.get("/health")
def health():
    return {"status": "ok"}
