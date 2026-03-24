import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

from .database import Base, engine
from .api import visitors

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Visitor Management System")

frontend_origins = os.getenv(
    "FRONTEND_ORIGINS",
    "http://localhost:3002,http://127.0.0.1:3002",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in frontend_origins.split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(visitors.router, tags=["visitors"])


@app.get("/")
def read_root():
    return {"message": "Welcome to Visitor Management System API"}
