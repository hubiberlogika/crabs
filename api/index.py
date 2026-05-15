import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv
from scraper import scrape_instagram_account

load_dotenv()

app = FastAPI(title="IG Real Estate Scraper API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATABASE_URL = os.getenv("DATABASE_URL", "")

def get_db_connection():
    if not DATABASE_URL:
        return None
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)

# Auto-create table on startup if it doesn't exist
def init_db():
    conn = get_db_connection()
    if conn:
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS properties (
                        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                        ig_post_url TEXT UNIQUE,
                        price TEXT,
                        land_area TEXT,
                        building_area TEXT,
                        bedrooms TEXT,
                        bathrooms TEXT,
                        floors TEXT,
                        facilities TEXT,
                        carport TEXT,
                        electricity TEXT,
                        water TEXT,
                        certificate TEXT,
                        agent_name TEXT,
                        description TEXT,
                        scraped_at TIMESTAMP
                    )
                """)
            conn.commit()
            print("Database table ensured.")
            
            with conn.cursor() as cur:
                cur.execute("ALTER TABLE properties ADD COLUMN IF NOT EXISTS is_manual BOOLEAN DEFAULT FALSE")
            conn.commit()
            with conn.cursor() as cur:
                cur.execute("ALTER TABLE properties ADD COLUMN IF NOT EXISTS photos JSONB DEFAULT '[]'")
            conn.commit()
        except Exception as e:
            print(f"Error initializing DB: {e}")
        finally:
            conn.close()

init_db()

class ScrapeRequest(BaseModel):
    target_username: str
    viewer_username: str = ""
    viewer_password: str = ""
    session_id: str = ""
    limit: int = 10

def process_scraping(req: ScrapeRequest):
    results = scrape_instagram_account(
        target_username=req.target_username,
        viewer_user=req.viewer_username,
        viewer_pass=req.viewer_password,
        session_id=req.session_id,
        limit=req.limit
    )
    
    saved_count = 0
    db_error = None
    conn = get_db_connection()
    if conn:
        try:
            with conn.cursor() as cur:
                for item in results:
                    cur.execute("""
                        INSERT INTO properties (
                            ig_post_url, price, land_area, building_area, bedrooms, 
                            bathrooms, floors, facilities, carport, electricity, 
                            water, certificate, agent_name, description, scraped_at
                        ) VALUES (
                            %(ig_post_url)s, %(price)s, %(land_area)s, %(building_area)s, %(bedrooms)s,
                            %(bathrooms)s, %(floors)s, %(facilities)s, %(carport)s, %(electricity)s,
                            %(water)s, %(certificate)s, %(agent_name)s, %(description)s, %(scraped_at)s
                        ) ON CONFLICT (ig_post_url) DO UPDATE SET
                            price = EXCLUDED.price,
                            land_area = EXCLUDED.land_area,
                            building_area = EXCLUDED.building_area,
                            bedrooms = EXCLUDED.bedrooms,
                            bathrooms = EXCLUDED.bathrooms,
                            floors = EXCLUDED.floors,
                            facilities = EXCLUDED.facilities,
                            carport = EXCLUDED.carport,
                            electricity = EXCLUDED.electricity,
                            water = EXCLUDED.water,
                            certificate = EXCLUDED.certificate,
                            agent_name = EXCLUDED.agent_name,
                            description = EXCLUDED.description,
                            scraped_at = EXCLUDED.scraped_at
                    """, item)
                    saved_count += 1
            conn.commit()
        except Exception as db_err:
            db_error = str(db_err)
            conn.rollback()
        finally:
            conn.close()
    
    return {"scraped": len(results), "saved": saved_count, "db_error": db_error}

@app.post("/api/scrape")
async def trigger_scrape(req: ScrapeRequest):
    # Mengambil kredensial dari Vercel Environment Variables jika di UI dikosongkan
    final_session_id = req.session_id or os.getenv("IG_SESSION_ID", "")
    final_username = req.viewer_username or os.getenv("IG_USERNAME", "")
    final_password = req.viewer_password or os.getenv("IG_PASSWORD", "")

    if not final_session_id and (not final_username or not final_password):
        raise HTTPException(status_code=400, detail="Masukkan Session ID atau Username/Password Viewer IG.")
    
    # Timpa req dengan data dari ENV agar terbaca oleh scraper
    req.session_id = final_session_id
    req.viewer_username = final_username
    req.viewer_password = final_password
        
    try:
        result = process_scraping(req)
        msg = f"Scraping selesai: {result['scraped']} data ditemukan, {result['saved']} disimpan ke DB."
        if result['db_error']:
            msg += f" DB Error: {result['db_error']}"
        return {"message": msg, "detail": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Scraping gagal: {str(e)}")

@app.get("/api/properties")
async def get_properties():
    conn = get_db_connection()
    if not conn:
        return {"error": "Database URL belum dikonfigurasi", "data": []}
    
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM properties ORDER BY scraped_at DESC")
            rows = cur.fetchall()
            return {"data": rows}
    except Exception as e:
        return {"error": str(e), "data": []}
    finally:
        conn.close()

@app.post("/api/properties/manual")
async def create_manual_property(prop: dict):
    conn = get_db_connection()
    if not conn:
        return {"error": "Database URL belum dikonfigurasi"}
        
    try:
        # Fill missing fields with empty string
        fields = ['price', 'land_area', 'building_area', 'bedrooms', 'bathrooms', 'floors', 
                  'facilities', 'carport', 'electricity', 'water', 'certificate', 'agent_name', 'description']
        for f in fields:
            if f not in prop:
                prop[f] = ""
                
        query = """
            INSERT INTO properties (
                price, land_area, building_area, bedrooms, bathrooms, floors,
                facilities, carport, electricity, water, certificate, agent_name, description, is_manual, scraped_at
            ) VALUES (
                %(price)s, %(land_area)s, %(building_area)s, %(bedrooms)s, %(bathrooms)s, %(floors)s,
                %(facilities)s, %(carport)s, %(electricity)s, %(water)s, %(certificate)s, %(agent_name)s, %(description)s, TRUE, CURRENT_TIMESTAMP
            ) RETURNING *
        """
        with conn.cursor() as cur:
            cur.execute(query, prop)
            new_row = cur.fetchone()
            conn.commit()
        return {"message": "Data manual berhasil ditambahkan", "data": new_row}
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()

@app.put("/api/properties/{prop_id}")
async def update_property(prop_id: str, updates: dict):
    conn = get_db_connection()
    if not conn:
        return {"error": "Database URL belum dikonfigurasi"}
        
    try:
        if not updates:
            return {"message": "Tidak ada data yang diupdate"}
            
        set_clauses = []
        values = []
        for key, val in updates.items():
            set_clauses.append(f"{key} = %s")
            values.append(val)
            
        values.append(prop_id)
        
        query = f"UPDATE properties SET {', '.join(set_clauses)} WHERE id = %s RETURNING *"
        
        with conn.cursor() as cur:
            cur.execute(query, values)
            updated_row = cur.fetchone()
            conn.commit()
            
        return {"message": "Update berhasil", "data": updated_row}
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()

import json

@app.post("/api/properties/{prop_id}/photos")
async def upload_photos(prop_id: str, data: dict):
    """Store base64 photo array for a property."""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database URL belum dikonfigurasi")
    try:
        photos = data.get("photos", [])
        if len(photos) > 8:
            photos = photos[:8]
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE properties SET photos = %s WHERE id = %s RETURNING id",
                (json.dumps(photos), prop_id)
            )
            conn.commit()
        return {"message": f"{len(photos)} foto berhasil disimpan"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.delete("/api/properties")
async def delete_all_properties():
    conn = get_db_connection()
    if not conn:
        return {"error": "Database URL belum dikonfigurasi"}
        
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM properties WHERE is_manual = FALSE OR is_manual IS NULL")
            conn.commit()
        return {"message": "Data hasil scraping berhasil dihapus (data manual aman)"}
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()
