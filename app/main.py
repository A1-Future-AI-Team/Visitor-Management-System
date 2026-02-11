from fastapi import FastAPI
from .database import engine, Base
from .api import visitors

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Visitor Management System")

app.include_router(visitors.router, tags=["visitors"])

@app.get("/")
def read_root():
    return {"message": "Welcome to Visitor Management System API"}
