from fastapi import FastAPI, UploadFile, File, Form, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
import shutil
import os
from ytmusicapi import YTMusic
from audio_engine import apply_equalizer, generate_waveform
import uuid
import yt_dlp
import requests

app = FastAPI()

# Klasör tanımları
UPLOAD_DIR = "uploads"
EXPORT_DIR = "exports"
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(EXPORT_DIR, exist_ok=True)

# Statik dosyalar ve şablonlar
app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")
templates = Jinja2Templates(directory="templates")

# YTMusic başlat
yt = YTMusic()

@app.get("/")
async def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/search")
async def search_music(query: str):
    results = yt.search(query, filter="songs")
    return JSONResponse(content=results)

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    file_id = str(uuid.uuid4())
    file_extension = file.filename.split(".")[-1]
    file_path = os.path.join(UPLOAD_DIR, f"{file_id}.{file_extension}")
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    return {"filename": file.filename, "file_id": file_id, "path": file_path}

@app.post("/export")
async def export_audio(
    file_id: str = Form(...),
    eq_settings: str = Form(...), # JSON string olarak gelecek
    original_filename: str = Form(None) # Opsiyonel: Orijinal dosya adı
):
    # Dosya yolunu bul
    input_path = None
    for f in os.listdir(UPLOAD_DIR):
        if f.startswith(file_id):
            input_path = os.path.join(UPLOAD_DIR, f)
            break
            
    if not input_path:
        return JSONResponse(content={"error": "File not found"}, status_code=404)

    # Çıktı dosya adını belirle
    if original_filename:
        # Uzantıyı .wav yap
        base_name = os.path.splitext(original_filename)[0]
        output_filename = f"{base_name}.wav"
    else:
        output_filename = f"eq_export_{file_id}.wav"
        
    output_path = os.path.join(EXPORT_DIR, f"eq_export_{file_id}.wav") # Disk'te unique tut, indirme adını değiştir

    
    try:
        apply_equalizer(input_path, output_path, eq_settings)
        return FileResponse(output_path, media_type="audio/wav", filename=output_filename)
    except Exception as e:
        print(f"EXPORT ERROR: {str(e)}") # Log error to console
        import traceback
        traceback.print_exc()
        return JSONResponse(content={"error": str(e)}, status_code=500)

@app.get("/analyze/{file_id}")
async def analyze_audio(file_id: str):
    """
    Verilen dosya ID'si için waveform grafiği oluşturur.
    YouTube trackleri için 'temp_{video_id}' formatını destekler.
    """
    try:
        if file_id.startswith("temp_"):
            # YouTube track
            video_id = file_id.replace("temp_", "")
            # M4A dosyasını bul (önceki indirmelerden)
            # Not: Tam path'i bulmak için uploads klasörünü taramamız gerekebilir 
            # veya indirilen dosyayı hatırlamamız gerekirdi.
            # Basit çözüm: Olası isimlendirmeyi dene.
            input_path = f"uploads/{file_id}.m4a"
            # Video ID'den direkt dosya adını bulmak zor olabilir çünkü yt-dlp clean yapıyor.
            # Alternatif: Klasörde video_id içeren dosyayı bul.
            found_file = None
            for f in os.listdir(UPLOAD_DIR):
                if video_id in f and (f.endswith('.m4a') or f.endswith('.webm') or f.endswith('.mp4')):
                    input_path = os.path.join(UPLOAD_DIR, f)
                    found_file = input_path
                    break
            
            if not found_file:
                 return JSONResponse(content={"error": "File not found"}, status_code=404)
            
            output_image_path = f"uploads/{file_id}_waveform.png"
            
        else:
            # Uploaded file
            files = [f for f in os.listdir(UPLOAD_DIR) if f.startswith(file_id)]
            if not files:
                 return JSONResponse(content={"error": "File not found"}, status_code=404)
            
            input_path = os.path.join(UPLOAD_DIR, files[0])
            output_image_path = f"uploads/{file_id}_waveform.png"

        # Varsa cache kullan
        if os.path.exists(output_image_path):
             return FileResponse(output_image_path)
             
        # Oluştur
        print(f"Generating waveform for {input_path}...")
        generate_waveform(input_path, output_image_path)
        return FileResponse(output_image_path)

    except Exception as e:
        print(f"Analysis error: {e}")
        return JSONResponse(content={"error": str(e)}, status_code=500)

@app.get("/stream/{video_id}")
async def stream_audio(video_id: str):
    print(f"Download request for video: {video_id}")
    try:
        # Dosya adını belirle
        output_filename = f"temp_{video_id}.m4a"
        output_path = os.path.join(UPLOAD_DIR, output_filename)
        
        # Eğer dosya zaten varsa direkt döndür (Cache mantığı)
        if os.path.exists(output_path):
            print(f"File exists in cache: {output_path}")
            return FileResponse(output_path, media_type="audio/mp4")
            
        # Yoksa indir
        ydl_opts = {
            'format': 'bestaudio[ext=m4a]/best',
            'outtmpl': output_path,
            'quiet': True,
            'noplaylist': True
        }
        
        print(f"Downloading {video_id}...")
        youtube_url = f"https://www.youtube.com/watch?v={video_id}"
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([youtube_url])
            
        print("Download complete.")
        return FileResponse(output_path, media_type="audio/mp4")
        
    except Exception as e:
        print(f"Download error for {video_id}: {e}")
        return JSONResponse(content={"error": str(e)}, status_code=500)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
