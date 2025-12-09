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