// FILE: src/utils.ts

export const formatRupiah = (amount: number): string => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
};

export const generateId = (): string => {
  return Math.random().toString(36).substr(2, 9);
};

// --- FUNGSI MEMBERSIHKAN ANGKA DARI STRING ---
export const parseNumber = (input: string | number | undefined): number => {
  if (!input) return 0;
  if (typeof input === 'number') return input;
  
  const cleanStr = input.replace(/[^0-9.,-]/g, '');
  const numericOnly = cleanStr.replace(/[,.]/g, ''); 
  return parseFloat(numericOnly) || 0;
};

// --- PERBAIKAN FUNGSI COMPRESS IMAGE ---
// Sekarang menerima input berupa File atau string Base64
export const compressImage = (input: File | string, maxWidth = 800, quality = 0.7): Promise<string> => {
  return new Promise((resolve, reject) => {
    // Helper function untuk memproses gambar setelah menjadi string base64/URL
    const processBitmap = (source: string) => {
        const img = new Image();
        img.src = source;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            
            // Logika Resize
            if (width > maxWidth) {
                height = Math.round((height * maxWidth) / width);
                width = maxWidth;
            }
            
            canvas.width = width;
            canvas.height = height;
            
            const ctx = canvas.getContext('2d');
            if (!ctx) { 
                reject(new Error('Gagal membuat context canvas')); 
                return; 
            }
            
            // Gambar ke canvas dan kompres
            ctx.fillStyle = '#FFFFFF'; // Mencegah background hitam pada PNG transparan
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
            
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = (error) => reject(error);
    };

    // Cek tipe input
    if (typeof input === 'string') {
        // Jika input sudah base64
        processBitmap(input);
    } else if (input instanceof File || input instanceof Blob) {
        // Jika input adalah File, baca dulu jadi Data URL
        const reader = new FileReader();
        reader.onload = (event) => {
            if (event.target?.result) {
                processBitmap(event.target.result as string);
            } else {
                reject(new Error("Gagal membaca file gambar"));
            }
        };
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(input);
    } else {
        reject(new Error("Format input gambar tidak dikenali"));
    }
  });
};

export const parseCSV = (text: string) => {
  const lines = text.split('\n').filter(l => l.trim() !== '');
  if (lines.length === 0) return [];
  const parseLine = (line: string) => {
      const result = [];
      let startValueIndex = 0;
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
          if (line[i] === '"') { inQuotes = !inQuotes; } 
          else if (line[i] === ',' && !inQuotes) {
              let val = line.substring(startValueIndex, i).trim();
              if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1).replace(/""/g, '"');
              result.push(val);
              startValueIndex = i + 1;
          }
      }
      let val = line.substring(startValueIndex).trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1).replace(/""/g, '"');
      result.push(val);
      return result;
  };
  const headers = parseLine(lines[0]);
  const result = [];
  for (let i = 1; i < lines.length; i++) {
    const currentLine = lines[i];
    if(!currentLine.trim()) continue;
    const matches = parseLine(currentLine);
    if (matches.length > 0) {
        const obj: any = {};
        headers.forEach((header, index) => {
            const cleanHeader = header.replace(/^"|"$/g, '');
            obj[cleanHeader] = matches[index] || '';
        });
        result.push(obj);
    }
  }
  return result;
};