export const WELCOME_MESSAGES = {
  pagi: [
    "Morning, [USERNAME]! What's up?",
    "Rise and grind, [USERNAME]!",
    "Good morning, [USERNAME]!",
    "Morning check-in, [USERNAME]!",
  ],
  siang: [
    "Good afternoon, [USERNAME]!",
    "Hey [USERNAME], what's good?",
    "Midday check-in, [USERNAME]!",
    "Afternoon vibes, [USERNAME]!",
  ],
  sore: [
    "Evening vibes, [USERNAME]!",
    "Good evening, [USERNAME]!",
    "Evening check-in, [USERNAME]!",
    "Hey [USERNAME], what's up?",
  ],
  malam: [
    "Night session, [USERNAME]!",
    "Evening, [USERNAME]!",
    "Late night work, [USERNAME]?",
    "Night check-in, [USERNAME]!",
  ],
  anytime: [
    "What's new, [USERNAME]?",
    "Hey there, [USERNAME]!",
    "Yo [USERNAME], what's the mission?",
    "What's poppin', [USERNAME]?",
    "Back again, [USERNAME]?",
    "Let's get it, [USERNAME]!",
    "Another day, another slay, [USERNAME]!",
    "Ready to get things done, [USERNAME]?",
  ],
};


export const DIAMOND_LOGO_HTML = (accentColor) => `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { 
      width: 100%; 
      height: 100%; 
      background: transparent; 
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    figure {
      --size: 130px;
      --duration: 5s;
      --pull: -0.15;
      perspective: 30rem;
      display: grid;
      grid-template-areas: "figure";
      place-items: center;
      width: var(--size);
      height: var(--size);
      animation: spin-logo var(--duration) ease-in-out infinite;
    }
    
    figure > div {
      --radius: calc(var(--size) / 4);
      --deg: calc(var(--i) * (360deg / 10));
      --transform-start: translate3d(
          calc(cos(var(--deg)) * var(--radius)),
          calc(sin(var(--deg)) * var(--radius)),
          0
        )
        rotate(calc(var(--deg)));
      grid-area: figure;
      background-color: ${accentColor || 'hsl(225, 100%, 60%)'};
      width: calc(var(--size) / 4);
      height: calc(var(--size) / 4);
      clip-path: polygon(25% 25%, 100% 50%, 25% 75%, 0% 50%);
      transform: var(--transform-start);
      transform-style: preserve-3d;
      animation: diamonds var(--duration) cubic-bezier(0.87, 0, 0.13, 1) infinite;
    }
    
    @keyframes diamonds {
      0%, 20% {
        transform: var(--transform-start);
      }
      50% {
        clip-path: polygon(75% 25%, 100% 50%, 75% 75%, 0% 50%);
        transform: translate3d(
            calc(cos(var(--deg)) * var(--radius) * var(--pull)),
            calc(sin(var(--deg)) * var(--radius) * var(--pull)),
            5rem
          )
          rotate(calc(var(--deg) + 90deg));
      }
    }
    
    @keyframes spin-logo {
      0%, 20% { transform: translateY(0); }
      50% { transform: translateY(20px); }
      80%, 100% { transform: translateY(0); }
    }
  </style>
</head>
<body>
  <figure>
    <div style="--i: 1"></div>
    <div style="--i: 2"></div>
    <div style="--i: 3"></div>
    <div style="--i: 4"></div>
    <div style="--i: 5"></div>
    <div style="--i: 6"></div>
    <div style="--i: 7"></div>
    <div style="--i: 8"></div>
    <div style="--i: 9"></div>
    <div style="--i: 10"></div>
    <div style="--i: 11"></div>
    <div style="--i: 12"></div>
  </figure>
</body>
</html>
`;

export const GOOGLE_FAVICON = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
</svg>`;