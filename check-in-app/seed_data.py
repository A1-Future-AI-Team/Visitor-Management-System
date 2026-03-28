import json
import random
from sqlalchemy.orm import Session
from app.database import SessionLocal, engine, Base
from app.models import Visitor, VisitLog
from app.utils import placeholder_embedding


def seed():
    Base.metadata.create_all(bind=engine)

    db: Session = SessionLocal()

    if db.query(Visitor).count() > 0:
        print("Database already contains data. Skipping seeding.")
        return

    print("Seeding database...")

    visitors_data = [
        {"name": "Alice Johnson", "phone": "9876543210", "email": "alice@example.com"},
        {"name": "Bob Smith", "phone": "8765432109", "email": "bob@example.com"},
        {"name": "Charlie Brown", "phone": "7654321098", "email": "charlie@example.com"},
        {"name": "Alice  Johnson", "phone": "9876543211", "email": "alice.j@work.com"},
        {"name": "Dave Wilson", "phone": "8765432110", "email": "dave@example.com"},
    ]

    visitors = []
    for data in visitors_data:
        visitor = Visitor(
            name=data["name"],
            phone=data["phone"],
            email=data["email"],
            face_embedding=json.dumps(placeholder_embedding()),
        )
        db.add(visitor)
        visitors.append(visitor)

    db.commit()

    for visitor in visitors:
        for _ in range(random.randint(1, 4)):
            decision = random.choice(["ALLOW", "ALLOW", "DENY"])
            log = VisitLog(
                visitor_id=visitor.id,
                decision=decision,
                confidence_score=random.uniform(0.6, 0.95) if decision == "ALLOW" else random.uniform(0.1, 0.4),
                image_path="seeded_test_image.jpg",
            )
            db.add(log)

    db.commit()
    print("Seeding complete!")
    print("Seeded visitors use placeholder embeddings and are for admin/demo data only.")
    db.close()


if __name__ == "__main__":
    seed()
