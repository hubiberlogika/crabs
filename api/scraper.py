import re
from datetime import datetime
from typing import Dict, List, Optional
import logging

try:
    from instagrapi import Client as InstagrapiClient
except ImportError:
    InstagrapiClient = None

logger = logging.getLogger(__name__)

def parse_caption(caption: str) -> Dict[str, Optional[str]]:
    if not caption:
        return {}
    
    # Harga
    price = None
    m = re.search(r'\b(?:harga|price|rp|idr)\b\s*[:\-\.=]?\s*([Rr]p\s*)?([\d.,]+\s*(?:milyar|miliar|juta|ribu|m|jt|k|rb)?\b(?:\s*\(?nego\)?)?)', caption, re.IGNORECASE)
    if m: price = m.group(2).strip()
    
    # Luas Tanah
    land_area = None
    m = re.search(r'\b(?:Luas\s+Tanah|LT)\b\s*[:\-\.=]?\s*(\d+[\s]*(?:m2|m|meter)?)', caption, re.IGNORECASE)
    if m: land_area = m.group(1).strip()
    
    # Luas Bangunan
    building_area = None
    m = re.search(r'\b(?:Luas\s+Bangunan|LB)\b\s*[:\-\.=]?\s*(\d+[\s]*(?:m2|m|meter)?)', caption, re.IGNORECASE)
    if m: building_area = m.group(1).strip()
    
    # Kamar Tidur
    bedrooms = None
    m = re.search(r'\b(?:Kamar\s+Tidur|KT)\b\s*[:\-\.=]?\s*([^\n,•\|]+)', caption, re.IGNORECASE)
    if m: bedrooms = m.group(1).strip()
    
    # Kamar Mandi
    bathrooms = None
    m = re.search(r'\b(?:Kamar\s+Mandi|KM)\b\s*[:\-\.=]?\s*([^\n,•\|]+)', caption, re.IGNORECASE)
    if m: bathrooms = m.group(1).strip()
    
    # Lantai
    floors = None
    m = re.search(r'\b(\d+)\s+Lantai\b', caption, re.IGNORECASE)
    if m: floors = m.group(1) + ' Lantai'
    
    # Listrik
    electricity = None
    m = re.search(r'\bListrik\b\s*[:\-\.=]?\s*([\d.,]+\s*(?:VA|W|Watt|KW)?)', caption, re.IGNORECASE)
    if m: electricity = m.group(1).strip()
    
    # Sumber Air
    water_source = None
    wm = re.search(r'\b(Air\s+(?:PDAM|PAM|Tanah|Sumur|Bersih)[^,\n]*)', caption, re.IGNORECASE)
    if wm: water_source = wm.group(1).strip()
    
    # Dokumen / Sertifikat
    certificate = None
    m = re.search(r'\b(SHM|AJB|IMB|HGB|SHGB)\b(?:\s+On\s+Hand)?', caption, re.IGNORECASE)
    if m: certificate = m.group(1).upper()

    # Carport
    carport = None
    m = re.search(r'\bCarport\b\s*[:\-\.=]?\s*([^\n,•\|]+)', caption, re.IGNORECASE)
    if m: carport = m.group(1).strip()
    
    # Fasilitas
    facilities = None
    m = re.search(r'(?:Ada\s+Ruang|Fasilitas|Terdapat|Dengan|Bonus)\s*(Tamu|Keluarga|Pantry|Wet\s*Kitchen|Gudang|Laundry|AC|Kanopi|Kitchen\s*Set[^,\n•]*)', caption, re.IGNORECASE)
    if m: facilities = m.group(0).strip()
    
    # Agen & No HP
    agent_name = None
    pm = re.search(r'([A-Za-z\s\.]{2,20}?)\s*[\(\-\:]?\s*((?:08|\+62|62)[\d\s\-\+‑\u202a\u202c]{8,15})\)?', caption)
    if pm:
        name = pm.group(1).strip()
        name = re.sub(r'^(?:▫️|•|\*|-|Hubungi|Agent|Detail\s*:|more\s*info\s*:?|WA|Call|Hp)\s*', '', name, flags=re.IGNORECASE).strip()
        phone = re.sub(r'[^\d\+]', '', pm.group(2))
        if len(name) < 2:
            name = "Agen"
        agent_name = f"{name} ({phone})"

    return {
        'price': price,
        'land_area': land_area,
        'building_area': building_area,
        'bedrooms': bedrooms,
        'bathrooms': bathrooms,
        'floors': floors,
        'electricity': electricity,
        'water': water_source,
        'certificate': certificate,
        'carport': carport,
        'facilities': facilities,
        'agent_name': agent_name,
        'description': caption,
    }

def get_client(username=None, password=None, session_id=None):
    if not InstagrapiClient:
        raise Exception("instagrapi library not installed")
    cl = InstagrapiClient()
    
    if session_id:
        try:
            cl.login_by_sessionid(session_id)
            return cl
        except Exception as e:
            logger.warning(f"Login via Session ID gagal: {e}")
            
    if username and password:
        cl.login(username, password)
    return cl

def scrape_instagram_account(target_username: str, viewer_user: str = None, viewer_pass: str = None, session_id: str = None, limit: int = 10):
    cl = get_client(viewer_user, viewer_pass, session_id)
    # Remove @ if provided
    target_username = target_username.lstrip('@')
    
    user = cl.user_info_by_username(target_username)
    medias = cl.user_medias(user.pk, amount=limit)
    
    results = []
    for media in medias:
        caption = media.caption_text or ''
        
        # Abaikan/ignore jika tidak ada deskripsi
        if not caption.strip():
            continue
            
        parsed = parse_caption(caption)
        
        # Abaikan/ignore jika data properti tidak valid (harus ada harga dan kontak agen/HP)
        if not parsed.get('agent_name') or not parsed.get('price'):
            continue
            
        parsed['ig_post_url'] = f'https://www.instagram.com/p/{media.code}/'
        parsed['scraped_at'] = media.taken_at.isoformat() if media.taken_at else datetime.utcnow().isoformat()
        results.append(parsed)
        
    return results
