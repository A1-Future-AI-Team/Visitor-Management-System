import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

from .database import Base, engine
from . import models  # noqa: F401 — register all models with Base before create_all
from .api import visitors, visit_requests

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Visitor Management System")

frontend_origins = os.getenv(
    "FRONTEND_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in frontend_origins.split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(visitors.router, tags=["visitors"])
app.include_router(visit_requests.router, tags=["visit-requests"])


@app.get("/")
def read_root():
    return {"message": "Welcome to Visitor Management System API"}
