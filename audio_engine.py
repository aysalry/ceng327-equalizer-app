import soundfile as sf
import numpy as np
import json
import os

# pydub is optional - only needed for M4A YouTube tracks
try:
    from pydub import AudioSegment
    PYDUB_AVAILABLE = True
except ImportError:
    PYDUB_AVAILABLE = False
    print("Warning: pydub not available. M4A export will not work.")

def apply_equalizer(input_path, output_path, eq_settings_json):
    """
    Verilen ses dosyasına equalizer ayarlarını uygular ve kaydeder.
    eq_settings_json: Frekans (Hz) -> Kazanç (dB) eşleşmesi içeren JSON string.
    Desteklenen formatlar: WAV, MP3, FLAC, OGG, M4A vb.
    """
    
    # Ayarları parse et
    eq_gains = json.loads(eq_settings_json)
    
    # M4A dosyalarını önce WAV'a çevir (YouTube tracks için)
    temp_wav = None
    if input_path.lower().endswith('.m4a'):
        if not PYDUB_AVAILABLE:
            raise ValueError(
                "M4A dosyası işlenemedi. FFmpeg kurulu değil.\n"
                "Çözüm: Sadece yüklediğiniz WAV/MP3 dosyalarını export edebilirsiniz.\n"
                "YouTube şarkıları için export şu an çalışmıyor."
            )
        try:
            print(f"Converting M4A to WAV: {input_path}")
            audio = AudioSegment.from_file(input_path, format="m4a")
            temp_wav = input_path.replace('.m4a', '_temp.wav')
            audio.export(temp_wav, format="wav")
            input_path = temp_wav
            print(f"Conversion complete: {temp_wav}")
        except Exception as e:
            raise ValueError(f"M4A dosyası dönüştürülemedi: {str(e)}")
    
    # Dosyayı oku (SoundFile otomatik format algılar)
    try:
        data, sample_rate = sf.read(input_path)
    except Exception as e:
        # Temizlik
        if temp_wav and os.path.exists(temp_wav):
            os.remove(temp_wav)
        raise ValueError(f"Dosya okunamadı: {str(e)}")
    
    # Stereo/Mono kontrolü
    if len(data.shape) > 1:
        channels = [data[:, i] for i in range(data.shape[1])]
    else:
        channels = [data]
        
    processed_channels = []
    
    # FFT ile frekans domenine geç
    for channel in channels:
        fft_data = np.fft.rfft(channel)
        freqs = np.fft.rfftfreq(len(channel), 1/sample_rate)
        
        gain_mask = np.ones_like(fft_data, dtype=float)
        
        sorted_bands = sorted([int(k) for k in eq_gains.keys()])
        
        for i, band_freq in enumerate(sorted_bands):
            try:
                gain_db = float(eq_gains[str(band_freq)])
            except KeyError:
                 continue
                 
            gain_factor = 10 ** (gain_db / 20)
            
            lower_bound = 0 if i == 0 else (sorted_bands[i-1] + band_freq) / 2
            upper_bound = freqs[-1] if i == len(sorted_bands) - 1 else (band_freq + sorted_bands[i+1]) / 2
            
            indices = np.where((freqs >= lower_bound) & (freqs < upper_bound))
            gain_mask[indices] *= gain_factor
            
        fft_data_processed = fft_data * gain_mask
        processed_channel = np.fft.irfft(fft_data_processed)
        
        # Clipping önleme
        max_val = np.max(np.abs(processed_channel))
        if max_val > 1.0:
            processed_channel /= max_val
            
        processed_channels.append(processed_channel)
        
    # Kanalları birleştir
    if len(processed_channels) > 1:
        processed_data = np.column_stack(processed_channels)
    else:
        processed_data = processed_channels[0]
        
    # Kaydet (WAV olarak)
    sf.write(output_path, processed_data, sample_rate)
    
    # Temizlik: Geçici WAV dosyasını sil
    if temp_wav and os.path.exists(temp_wav):
        os.remove(temp_wav)
        print(f"Cleaned up temp file: {temp_wav}")

    return output_path

def generate_waveform(input_path, output_image_path):
    """
    Ses dosyasının dalga formu grafiğini oluşturur ve kaydeder.
    """
    import matplotlib
    matplotlib.use('Agg') # Optimize backend (non-GUI, faster)
    import matplotlib.pyplot as plt
    
    # M4A desteği için pydub kontrolü (yukarıdaki gibi)
    temp_wav = None
    if input_path.lower().endswith('.m4a'):
        if PYDUB_AVAILABLE:
            try:
                audio = AudioSegment.from_file(input_path, format="m4a")
                temp_wav = input_path.replace('.m4a', '_temp_analize.wav')
                audio.export(temp_wav, format="wav")
                input_path = temp_wav
            except:
                pass # Fail silently or handle error, continue to try reading

    try:
        data, sample_rate = sf.read(input_path)
    except Exception as e:
        if temp_wav and os.path.exists(temp_wav):
            os.remove(temp_wav)
        raise ValueError(f"Dosya okunamadı: {str(e)}")

    # Stereo ise mono yap (görselleştirme için)
    if len(data.shape) > 1:
        data = np.mean(data, axis=1)

    # Downsample (Hız için)
    # 5000 yerine 1000 nokta yeterli (görsel olarak benzer)
    target_points = 1000
    step = max(1, len(data) // target_points)
    data = data[::step]

    # Plot
    # DPI düşür ve boyut küçült (Hızlandırma)
    dpi = 70
    width_inch = 800 / dpi
    height_inch = 150 / dpi
    
    fig = plt.figure(figsize=(width_inch, height_inch), dpi=dpi, facecolor='#1a1b26')
    ax = fig.add_axes([0, 0, 1, 1]) # Tam çerçeve
    ax.plot(data, color='#bd93f9', linewidth=0.8)
    ax.axis('off')
    
    # Kaydet
    plt.savefig(output_image_path, facecolor='#1a1b26', format='png')
    plt.close(fig) # Memory leak önle
    
    if temp_wav and os.path.exists(temp_wav):
        os.remove(temp_wav)
        
    return output_image_path
