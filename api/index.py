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
    try:
        results = scrape_instagram_account(
            target_username=req.target_username,
            viewer_user=req.viewer_username,
            viewer_pass=req.viewer_password,
            session_id=req.session_id,
            limit=req.limit
        )
        
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
                conn.commit()
            except Exception as db_err:
                print(f"DB Error: {db_err}")
                conn.rollback()
            finally:
                conn.close()
                    
        print(f"Scraping selesai. Mendapatkan {len(results)} properti.")
    except Exception as e:
        print(f"Scraping gagal: {str(e)}")

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
        
    # Vercel Serverless tidak mendukung BackgroundTasks dengan baik, 
    # jadi kita jalankan secara synchronous.
    process_scraping(req)
    return {"message": f"Proses scraping untuk {req.target_username} selesai!"}

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

@app.delete("/api/properties")
async def delete_all_properties():
    conn = get_db_connection()
    if not conn:
        return {"error": "Database URL belum dikonfigurasi"}
        
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM properties")
            conn.commit()
        return {"message": "Semua data berhasil dihapus"}
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()
