from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from datetime import timedelta
import database, auth

router = APIRouter(prefix="/api", tags=["API"])

class UserCreate(BaseModel):
    username: str
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    username: str

class ProfileUpdate(BaseModel):
    old_password: str
    new_password: str
    new_username: Optional[str] = None

class ShoppingListCreate(BaseModel):
    name: str

class ShoppingItemCreate(BaseModel):
    name: str
    quantity: str = "1"
    category: str = "Groceries"
    price: Optional[float] = 0.0
    is_completed: Optional[bool] = False

@router.post("/auth/register", response_model=Token)
def register(user: UserCreate, db: Session = Depends(database.get_db)):
    db_user = db.query(database.User).filter(database.User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    hashed_password = auth.get_password_hash(user.password)
    new_user = database.User(username=user.username, hashed_password=hashed_password)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    access_token = auth.create_access_token(data={"sub": new_user.username})
    return {"access_token": access_token, "token_type": "bearer", "username": new_user.username}

@router.post("/auth/login", response_model=Token)
def login(user: UserLogin, db: Session = Depends(database.get_db)):
    db_user = db.query(database.User).filter(database.User.username == user.username).first()
    if not db_user or not auth.verify_password(user.password, db_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(days=7)
    access_token = auth.create_access_token(
        data={"sub": db_user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer", "username": db_user.username}

# Helper to get current user
from fastapi.security import OAuth2PasswordBearer
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(database.get_db)):
    import jwt
    from auth import SECRET_KEY, ALGORITHM
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="Invalid token")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    user = db.query(database.User).filter(database.User.username == username).first()
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user

@router.put("/auth/profile")
def update_profile(data: ProfileUpdate, current_user: database.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    if not auth.verify_password(data.old_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect old password")
    
    if data.new_username and data.new_username != current_user.username:
        existing = db.query(database.User).filter(database.User.username == data.new_username).first()
        if existing:
            raise HTTPException(status_code=400, detail="Username already taken")
        current_user.username = data.new_username

    if data.new_password:
        current_user.hashed_password = auth.get_password_hash(data.new_password)
        
    db.commit()
    db.refresh(current_user)
    return {"status": "Profile updated", "new_username": current_user.username}

@router.get("/lists")
def get_lists(current_user: database.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    lists = db.query(database.ShoppingList).filter(database.ShoppingList.user_id == current_user.id).all()
    return [{"id": l.id, "name": l.name, "created_at": l.created_at} for l in lists]

@router.post("/lists")
def create_list(list_data: ShoppingListCreate, current_user: database.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    new_list = database.ShoppingList(name=list_data.name, user_id=current_user.id)
    db.add(new_list)
    db.commit()
    db.refresh(new_list)
    return {"id": new_list.id, "name": new_list.name}

@router.delete("/lists/{list_id}")
def delete_list(list_id: str, current_user: database.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    db_list = db.query(database.ShoppingList).filter(database.ShoppingList.id == list_id, database.ShoppingList.user_id == current_user.id).first()
    if not db_list:
        raise HTTPException(status_code=404, detail="List not found")
    
    db.delete(db_list)
    db.commit()
    return {"status": "deleted"}

@router.put("/lists/{list_id}")
def update_list(list_id: str, list_data: ShoppingListCreate, current_user: database.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    db_list = db.query(database.ShoppingList).filter(database.ShoppingList.id == list_id, database.ShoppingList.user_id == current_user.id).first()
    if not db_list:
        raise HTTPException(status_code=404, detail="List not found")
    
    db_list.name = list_data.name
    db.commit()
    db.refresh(db_list)
    return {"id": db_list.id, "name": db_list.name}

@router.get("/lists/{list_id}/items")
def get_list_items(list_id: str, current_user: database.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    # verify ownership
    sl = db.query(database.ShoppingList).filter(database.ShoppingList.id == list_id, database.ShoppingList.user_id == current_user.id).first()
    if not sl:
        raise HTTPException(status_code=404, detail="List not found")
    
    items = db.query(database.ShoppingItem).filter(database.ShoppingItem.list_id == list_id).all()
    return [{"id": i.id, "name": i.name, "quantity": i.quantity, "category": i.category, "price": i.price, "is_completed": bool(i.is_completed)} for i in items]

@router.post("/lists/{list_id}/items")
def add_item_to_list(list_id: str, item: ShoppingItemCreate, current_user: database.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    sl = db.query(database.ShoppingList).filter(database.ShoppingList.id == list_id, database.ShoppingList.user_id == current_user.id).first()
    if not sl:
        raise HTTPException(status_code=404, detail="List not found")
    
    new_item = database.ShoppingItem(
        name=item.name,
        quantity=item.quantity,
        category=item.category,
        price=item.price,
        is_completed=1 if item.is_completed else 0,
        list_id=list_id
    )
    db.add(new_item)
    db.commit()
    db.refresh(new_item)
    return {"id": new_item.id, "name": new_item.name, "quantity": new_item.quantity, "category": new_item.category, "is_completed": bool(new_item.is_completed)}

@router.put("/items/{item_id}")
def update_item(item_id: str, item: ShoppingItemCreate, current_user: database.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    db_item = db.query(database.ShoppingItem).join(database.ShoppingList).filter(
        database.ShoppingItem.id == item_id,
        database.ShoppingList.user_id == current_user.id
    ).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    db_item.name = item.name
    db_item.quantity = item.quantity
    db_item.category = item.category
    db_item.price = item.price
    if item.is_completed is not None:
        db_item.is_completed = 1 if item.is_completed else 0
    db.commit()
    db.refresh(db_item)
    return {"id": db_item.id, "name": db_item.name, "quantity": db_item.quantity, "category": db_item.category, "is_completed": bool(db_item.is_completed)}

@router.delete("/items/{item_id}")
def delete_item(item_id: str, current_user: database.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    db_item = db.query(database.ShoppingItem).join(database.ShoppingList).filter(
        database.ShoppingItem.id == item_id,
        database.ShoppingList.user_id == current_user.id
    ).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    db.delete(db_item)
    db.commit()
    return {"status": "deleted"}
