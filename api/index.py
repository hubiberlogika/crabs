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
            with conn.cursor() as cur:
                cur.execute("ALTER TABLE properties ADD COLUMN IF NOT EXISTS ig_posted_at TIMESTAMP")
            conn.commit()
            with conn.cursor() as cur:
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS ig_post_log (
                        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                        property_id UUID,
                        posted_at TIMESTAMP DEFAULT NOW(),
                        status TEXT,
                        ig_url TEXT
                    )
                """)
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

# ─── IG Posting ────────────────────────────────────────────────────────────────
import tempfile, base64 as b64mod, os as _os

class IGPostRequest(BaseModel):
    prop_id: str
    session_id: str = ""
    poster_username: str = ""
    poster_password: str = ""
    daily_limit: int = 3

def _build_caption(prop: dict) -> str:
    lines = ["🏠 *PROPERTI DIJUAL*", ""]
    if prop.get("price"):         lines.append(f"💰 Harga   : {prop['price']}")
    if prop.get("land_area"):     lines.append(f"📐 LT      : {prop['land_area']} m²")
    if prop.get("building_area"): lines.append(f"🏗 LB      : {prop['building_area']} m²")
    if prop.get("bedrooms"):      lines.append(f"🛏 KT      : {prop['bedrooms']}")
    if prop.get("bathrooms"):     lines.append(f"🚿 KM      : {prop['bathrooms']}")
    if prop.get("floors"):        lines.append(f"🏢 Lantai  : {prop['floors']}")
    if prop.get("certificate"):   lines.append(f"📜 Surat   : {prop['certificate']}")
    if prop.get("electricity"):   lines.append(f"⚡ Listrik : {prop['electricity']}")
    if prop.get("water"):         lines.append(f"💧 Air     : {prop['water']}")
    if prop.get("carport"):       lines.append(f"🚗 Carport : {prop['carport']}")
    if prop.get("facilities"):    lines.append(f"✨ Fasilitas: {prop['facilities']}")
    lines += ["", "📞 Info & penawaran:"]
    if prop.get("agent_name"):    lines.append(f"👤 {prop['agent_name']}")
    lines += ["", "#properti #rumah #dijual #realestate #investasi #rumahidaman"]
    return "\n".join(lines)

@app.get("/api/ig/post-status")
async def get_post_status():
    """Return how many posts were made today."""
    conn = get_db_connection()
    if not conn:
        return {"today_count": 0}
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) as cnt FROM ig_post_log WHERE DATE(posted_at) = CURRENT_DATE AND status = 'success'"
            )
            row = cur.fetchone()
            return {"today_count": row["cnt"] if row else 0}
    except Exception as e:
        return {"today_count": 0, "error": str(e)}
    finally:
        conn.close()

@app.post("/api/ig/post")
async def post_to_ig(req: IGPostRequest):
    """Post a manual property listing to Instagram."""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database URL belum dikonfigurasi")

    # Resolve credentials from ENV fallback
    final_session  = req.session_id      or os.getenv("IG_POSTER_SESSION_ID", "") or os.getenv("IG_SESSION_ID", "")
    final_username = req.poster_username or os.getenv("IG_POSTER_USERNAME", "")
    final_password = req.poster_password or os.getenv("IG_POSTER_PASSWORD", "")

    if not final_session and (not final_username or not final_password):
        raise HTTPException(status_code=400, detail="Masukkan Session ID atau Username/Password akun poster IG.")

    try:
        # Check daily limit
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) as cnt FROM ig_post_log WHERE DATE(posted_at) = CURRENT_DATE AND status = 'success'"
            )
            row  = cur.fetchone()
            done = row["cnt"] if row else 0
        if done >= req.daily_limit:
            raise HTTPException(status_code=429, detail=f"Batas posting harian sudah tercapai ({done}/{req.daily_limit}). Coba lagi besok.")

        # Fetch property
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM properties WHERE id = %s", (req.prop_id,))
            prop = cur.fetchone()
        if not prop:
            raise HTTPException(status_code=404, detail="Properti tidak ditemukan")

        prop = dict(prop)
        photos = prop.get("photos") or []
        if not photos:
            raise HTTPException(status_code=400, detail="Properti tidak memiliki foto. Tambahkan minimal 1 foto sebelum posting.")

        # Build caption
        from scraper import get_client
        caption = _build_caption(prop)

        # Decode base64 photos to temp files
        temp_paths = []
        for b64_str in photos[:8]:
            if "," in b64_str:
                b64_str = b64_str.split(",")[1]
            img_bytes = b64mod.b64decode(b64_str)
            tf = tempfile.NamedTemporaryFile(delete=False, suffix=".jpg")
            tf.write(img_bytes)
            tf.close()
            temp_paths.append(tf.name)

        # Login and post
        try:
            cl = get_client(final_username, final_password, final_session)
            if len(temp_paths) == 1:
                media = cl.photo_upload(temp_paths[0], caption)
            else:
                media = cl.album_upload(temp_paths, caption)
            ig_url = f"https://www.instagram.com/p/{media.code}/"
        finally:
            for p in temp_paths:
                try: _os.unlink(p)
                except: pass

        # Log success and update property
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO ig_post_log (property_id, status, ig_url) VALUES (%s, 'success', %s)",
                (req.prop_id, ig_url)
            )
            cur.execute(
                "UPDATE properties SET ig_posted_at = NOW() WHERE id = %s",
                (req.prop_id,)
            )
            conn.commit()

        return {"message": "Berhasil diposting ke Instagram!", "ig_url": ig_url}

    except HTTPException:
        raise
    except Exception as e:
        err = str(e)
        # Log failure
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO ig_post_log (property_id, status, ig_url) VALUES (%s, 'failed', %s)",
                    (req.prop_id, err[:200])
                )
                conn.commit()
        except: pass
        raise HTTPException(status_code=500, detail=f"Gagal posting: {err}")
    finally:
        conn.close()
