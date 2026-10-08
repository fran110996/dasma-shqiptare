# 💍 Ahengu Shqiptare — TikTok LIVE interactive game

Viewers send gifts during your TikTok LIVE and join an Albanian wedding on screen with their profile picture.

| Gift | Coins | What happens |
|---|---|---|
| 🌹 Rose | 1 | **Tupan**: you play the drum (live 7/8 drum beat, +4s per rose) |
| 💐 Rosa | 10 | **Futesh në valle**: you join the circle dance |
| ❤️ 1000 likes | — | **Futesh në valle**: a viewer who sends 1000 likes in total joins the dance |
| 🕊️ Paper Crane | 99 | **Shoqja e nuses**: bride's friend (bride's side) |
| 🎉 Confetti | 100 | **Bakshish**: money rain that piles up on the floor |
| 💕 Hearts | 199 | **Shoku i dhëndrrit**: groom's best man (with hat & mustache) |
| 🪕 Semsemia | 200 | **Dolli për çiftin**: everyone raises a glass and toasts the couple |
| 🤠 Pink Cowboy | 450 | **Nusja**: you become the bride |
| 🚂 Train | 899 | **Dhëndri**: you become the groom |

Also:
- **Bujarët e dasmës** leaderboard. The #1 gifter is the **KUMBARI** 👑 and leads the dance.
- **TORTA** meter fills with coins. When it's full, the cake is cut with fireworks.
- **QEJFI** meter fills with likes, chat and gifts. At 100% the party mode starts.
- Viewers on screen get chat bubbles. Typing **HOP** makes their character jump.
- Welcome messages for new viewers, plus shares and follows.

Gifts are matched by name, then by coin value. Any other gift maps to the closest lower tier. The server logs print every gift's real name and coins, so names can be fixed in `server/config.js` if needed. Gifts, texts and goals are all editable in `server/config.js`.

## Run

```bash
npm install
npm start
```

- Control panel: http://localhost:3000
- OBS overlay: http://localhost:3000/overlay

## OBS setup

1. Sources → **Browser** → URL `http://localhost:3000/overlay`
2. Width **1080**, Height **1920** (vertical canvas)
3. Tick **Control audio via OBS** to get the drum and sound effects.

## Going live

1. Start your TikTok LIVE.
2. In the control panel, type your username and click **Connect**.

Optional `.env` (copy `.env.example`): `TIKTOK_USERNAME` auto-connects on start, `SESSION_ID` improves connection reliability.

## Music

Put your own `.mp3` files in `public/music/` and they play on a loop. The song name appears on screen.
The drum and all sound effects are synthesized, so no audio files are needed.

## Testing without being live

The control panel has test buttons for every gift, likes, joins, shares and chat, plus:
- **🎬 Showcase (55s)**: a scripted sequence of every feature, good for recording a demo.
- **▶ Auto demo**: random viewers and gifts running continuously.

## Deploy on Render

1. Render → **New → Blueprint** → pick this repo (it reads `render.yaml`).
2. Set `ADMIN_PASSWORD`: the control panel buttons ask for it.
3. Control panel: `https://<your-app>.onrender.com`. OBS overlay: `https://<your-app>.onrender.com/overlay`

On the free plan the server sleeps after ~15 min without use, so open the panel a few minutes before going live. It also loses the leaderboard when it restarts.
