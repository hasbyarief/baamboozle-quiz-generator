import express from 'express';
import type { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(express.json());

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

app.post('/api/generate-questions', async (req: Request, res: Response) => {
  try {
    const { topic, count } = req.body;
    if (!topic || typeof topic !== 'string' || !topic.trim()) {
      return res.status(400).json({ error: 'Silakan masukkan topik kuis.' });
    }

    const numQuestions = Math.min(Math.max(parseInt(count as string) || 20, 6), 30);
    const candidateModels = ['gemini-3-flash-preview', 'gemini-3.5-flash', 'gemini-3.8-flash'];
    let lastError: any = null;
    let questions: any[] = [];

    const prompt = `Buatkan ${numQuestions} pertanyaan kuis yang menarik, variatif, akurat, dan seru tentang topik: "${topic.trim()}". Berikan dalam bahasa Indonesia (atau sesuaikan bila topik khusus bahasa asing). Pastikan pertanyaan jelas dan jawaban singkat, padat, dan tepat.`;

    const schemaConfig = {
      systemInstruction: 'Anda adalah asisten pembuat soal kuis edukasi dan trivia interaktif Baamboozle. Hasilkan array JSON murni berisi pertanyaan kuis. Setiap item harus berupa objek dengan properti "q" (pertanyaan) dan "a" (jawaban ringkas dan tepat).',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            q: {
              type: Type.STRING,
              description: 'Pertanyaan kuis'
            },
            a: {
              type: Type.STRING,
              description: 'Jawaban singkat dan akurat'
            }
          },
          required: ['q', 'a']
        }
      }
    };

    for (const model of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: schemaConfig,
        });

        const text = response.text?.trim() || '[]';
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed) && parsed.length > 0) {
          questions = parsed;
          break;
        }
      } catch (err: any) {
        console.warn(`Model ${model} failed, trying next fallback:`, err?.message || err);
        lastError = err;
      }
    }

    if (questions.length === 0) {
      throw lastError || new Error('Gagal menghasilkan soal kuis dengan AI.');
    }

    return res.json({ questions });
  } catch (error: any) {
    console.error('Error generating questions with Gemini:', error);
    return res.status(500).json({ 
      error: error?.message || 'Gagal menghasilkan soal kuis dengan AI. Pastikan GEMINI_API_KEY terkonfigurasi.' 
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${port}`);
  });
}

startServer();
