/// App string constants - EXACT MATCH RN strings.js

/// Welcome messages based on time of day
class WelcomeMessages {
  static const Map<String, List<String>> messages = {
    'pagi': [
      "Morning, [USERNAME]! What's up?",
      "Rise and grind, [USERNAME]!",
      "Good morning, [USERNAME]!",
      "Morning check-in, [USERNAME]!",
    ],
    'siang': [
      "Good afternoon, [USERNAME]!",
      "Hey [USERNAME], what's good?",
      "Midday check-in, [USERNAME]!",
      "Afternoon vibes, [USERNAME]!",
    ],
    'sore': [
      "Evening vibes, [USERNAME]!",
      "Good evening, [USERNAME]!",
      "Evening check-in, [USERNAME]!",
      "Hey [USERNAME], what's up?",
    ],
    'malam': [
      "Night session, [USERNAME]!",
      "Evening, [USERNAME]!",
      "Late night work, [USERNAME]?",
      "Night check-in, [USERNAME]!",
    ],
    'anytime': [
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

  static String getWelcomeMessage({String? username}) {
    final hour = DateTime.now().hour;
    String timeOfDay;
    
    if (hour >= 5 && hour < 11) {
      timeOfDay = 'pagi';
    } else if (hour >= 11 && hour < 15) {
      timeOfDay = 'siang';
    } else if (hour >= 15 && hour < 18) {
      timeOfDay = 'sore';
    } else {
      timeOfDay = 'malam';
    }
    
    // Combine time-specific and anytime messages
    final timeMessages = messages[timeOfDay] ?? [];
    final anytimeMessages = messages['anytime'] ?? [];
    final allMessages = [...timeMessages, ...anytimeMessages];
    
    // Pick random message
    final randomIndex = DateTime.now().millisecondsSinceEpoch % allMessages.length;
    String message = allMessages[randomIndex];
    
    // Replace username placeholder
    message = message.replaceAll('[USERNAME]', username ?? 'there');
    
    return message;
  }
}

/// Diamond Logo HTML for WebView - EXACT MATCH RN
String getDiamondLogoHtml(String accentColor) => '''
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
      background-color: $accentColor;
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
''';

/// Diamond Logo HTML for Loader (with shimmer) - EXACT MATCH RN
String getDiamondLogoLoaderHtml(String accentColor) => '''
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
      pointer-events: none;
    }
    
    figure {
      --size: 130px;
      --duration: 5.00s;
      --pull: -0.15;
      --base-color: $accentColor;
      --shimmer-color: hsl(200, 100%, 75%);
      perspective: 30rem;
      display: grid;
      grid-template-areas: "figure";
      place-items: center;
      width: var(--size);
      height: var(--size);
      animation: spin-logo var(--duration) ease-in-out infinite;
      animation-delay: -2.90s;
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
      width: calc(var(--size) / 4);
      height: calc(var(--size) / 4);
      clip-path: polygon(25% 25%, 100% 50%, 25% 75%, 0% 50%);
      transform: var(--transform-start);
      transform-style: preserve-3d;
      animation: 
        diamonds var(--duration) cubic-bezier(0.87, 0, 0.13, 1) infinite,
        shimmer-color 3s ease-in-out infinite;
      animation-delay: -2.90s, calc(var(--i) * -0.15s);
      background: linear-gradient(
        110deg,
        var(--base-color) 0%,
        var(--base-color) 35%,
        var(--shimmer-color) 50%,
        var(--base-color) 65%,
        var(--base-color) 100%
      );
      background-size: 300% 100%;
    }
    
    @keyframes shimmer-color {
      0%, 100% { background-position: 100% 50%; }
      50% { background-position: 0% 50%; }
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
      80%, 100% {
        transform: var(--transform-start);
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
  </figure>
</body>
</html>
''';

/// Logo SVG
const String logoSvg = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 336.59 72.59"><path fill="#dbdbdb" d="M64.15,49.65h-2.72s-.01,0-.02.01c-1.82,4.18-3.76,7.52-5.75,9.93-1.85,2.24-4.16,3.95-6.86,5.08-2.73,1.14-6.26,1.73-10.5,1.73-5.9,0-11.12-1.46-15.5-4.34-4.4-2.89-7.78-6.69-10.06-11.29-2.29-4.62-3.45-9.51-3.45-14.54,0-5.71,1.07-10.72,3.19-14.88,2.09-4.12,5.21-7.34,9.26-9.58,4.08-2.25,9.1-3.4,14.91-3.4,5.45,0,10.02,1.11,13.57,3.29,3.66,2.25,6.48,6.11,8.36,11.47,0,0,.01.01.02.01h2.6c.27,0,.53-.11.72-.31.19-.2.29-.46.28-.73l-.63-14.63c-6.44-3.81-14.74-5.74-24.66-5.74-6.84,0-13.14,1.51-18.73,4.5-5.61,2.99-10.09,7.33-13.32,12.88C1.64,24.63,0,31.12,0,38.36c0,6.16,1.47,11.89,4.38,17.03,2.91,5.15,7.25,9.33,12.88,12.41,5.62,3.07,12.4,4.63,20.17,4.63,9.33,0,17.96-1.78,25.65-5.3l2.07-16.36c.04-.28-.05-.57-.24-.79-.19-.22-.46-.34-.75-.34Z"/></svg>''';

/// Pencil icon SVG
const String pencilSvg = '<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M2.6687 11.333V8.66699C2.6687 7.74455 2.66841 7.01205 2.71655 6.42285C2.76533 5.82612 2.86699 5.31731 3.10425 4.85156L3.25854 4.57617C3.64272 3.94975 4.19392 3.43995 4.85229 3.10449L5.02905 3.02149C5.44666 2.84233 5.90133 2.75849 6.42358 2.71582C7.01272 2.66769 7.74445 2.66797 8.66675 2.66797H9.16675C9.53393 2.66797 9.83165 2.96586 9.83179 3.33301C9.83179 3.70028 9.53402 3.99805 9.16675 3.99805H8.66675C7.7226 3.99805 7.05438 3.99834 6.53198 4.04102C6.14611 4.07254 5.87277 4.12568 5.65601 4.20313L5.45581 4.28906C5.01645 4.51293 4.64872 4.85345 4.39233 5.27149L4.28979 5.45508C4.16388 5.7022 4.08381 6.01663 4.04175 6.53125C3.99906 7.05373 3.99878 7.7226 3.99878 8.66699V11.333C3.99878 12.2774 3.99906 12.9463 4.04175 13.4688C4.08381 13.9833 4.16389 14.2978 4.28979 14.5449L4.39233 14.7285C4.64871 15.1465 5.01648 15.4871 5.45581 15.7109L5.65601 15.7969C5.87276 15.8743 6.14614 15.9265 6.53198 15.958C7.05439 16.0007 7.72256 16.002 8.66675 16.002H11.3337C12.2779 16.002 12.9461 16.0007 13.4685 15.958C13.9829 15.916 14.2976 15.8367 14.5447 15.7109L14.7292 15.6074C15.147 15.3511 15.4879 14.9841 15.7117 14.5449L15.7976 14.3447C15.8751 14.128 15.9272 13.8546 15.9587 13.4688C16.0014 12.9463 16.0017 12.2774 16.0017 11.333V10.833C16.0018 10.466 16.2997 10.1681 16.6667 10.168C17.0339 10.168 17.3316 10.4659 17.3318 10.833V11.333C17.3318 12.2555 17.3331 12.9879 17.2849 13.5771C17.2422 14.0993 17.1584 14.5541 16.9792 14.9717L16.8962 15.1484C16.5609 15.8066 16.0507 16.3571 15.4246 16.7412L15.1492 16.8955C14.6833 17.1329 14.1739 17.2354 13.5769 17.2842C12.9878 17.3323 12.256 17.332 11.3337 17.332H8.66675C7.74446 17.332 7.01271 17.3323 6.42358 17.2842C5.90135 17.2415 5.44665 17.1577 5.02905 16.9785L4.85229 16.8955C4.19396 16.5601 3.64271 16.0502 3.25854 15.4238L3.10425 15.1484C2.86697 14.6827 2.76534 14.1739 2.71655 13.5771C2.66841 12.9879 2.6687 12.2555 2.6687 11.333ZM13.4646 3.11328C14.4201 2.334 15.8288 2.38969 16.7195 3.28027L16.8865 3.46485C17.6141 4.35685 17.6143 5.64423 16.8865 6.53613L16.7195 6.7207L11.6726 11.7686C11.1373 12.3039 10.4624 12.6746 9.72827 12.8408L9.41089 12.8994L7.59351 13.1582C7.38637 13.1877 7.17701 13.1187 7.02905 12.9707C6.88112 12.8227 6.81199 12.6134 6.84155 12.4063L7.10132 10.5898L7.15991 10.2715C7.3262 9.53749 7.69692 8.86241 8.23218 8.32715L13.2791 3.28027L13.4646 3.11328ZM15.7791 4.2207C15.3753 3.81702 14.7366 3.79124 14.3035 4.14453L14.2195 4.2207L9.17261 9.26856C8.81541 9.62578 8.56774 10.0756 8.45679 10.5654L8.41772 10.7773L8.28296 11.7158L9.22241 11.582L9.43433 11.543C9.92426 11.432 10.3749 11.1844 10.7322 10.8271L15.7791 5.78027L15.8552 5.69629C16.185 5.29194 16.1852 4.708 15.8552 4.30371L15.7791 4.2207Z"></path></svg>';
