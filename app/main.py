from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import engine, Base
from .api import visitors

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Visitor Management System")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(visitors.router, tags=["visitors"])

@app.get("/")
def read_root():
    return {"message": "Welcome to Visitor Management System API"}
