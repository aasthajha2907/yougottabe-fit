# yougottabe.fit 🔥

A personal fitness & nutrition tracker built for real life — specifically Indian home cooking, custom portion sizes, and actual motivation.

## Features
- 📷 **Nutrition label scanner** — photograph any packaged food label, Claude reads all macros + micros automatically
- 🥗 **Custom food library** — add ingredients with exact portion sizes (grams, katori, roti, tbsp — whatever)
- 🍲 **Recipe builder** — combine ingredients into recipes with custom quantities
- 🔥 **Fat loss tracking** — see actual grams of fat burned from your calorie deficit, not just numbers
- 📊 **BMR + TDEE calculator** — Mifflin-St Jeor formula with activity multiplier
- 📈 **History + month comparison** — compare any two months head to head
- 💧 **Steps + water tracking**
- 📱 **PWA** — installable on iPhone and Android home screens

## Tech
- React 18
- localStorage (no backend, no accounts, data stays on your device)
- Anthropic Claude API (for label scanning)
- Hosted on Vercel

## Deploy
1. Clone this repo
2. Connect to Vercel
3. Add environment variable: `REACT_APP_ANTHROPIC_KEY` (your Anthropic API key)
4. Deploy

## Local dev
```bash
npm install
npm start
```
