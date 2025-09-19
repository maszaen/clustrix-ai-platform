#!/usr/bin/env python3
"""
Instant Automation Web Opener
Auto-opens multiple websites in your default browser
Perfect for daily workflow automation!
"""

import webbrowser
import time
import sys


def instant_web_opener():
    """
    Opens multiple websites instantly in your browser
    Add your URLs to the websites array below
    """

    # 🔥 ADD YOUR WEBSITES HERE 🔥
    # Just paste your URLs separated by commas, super easy!
    websites = [
        "https://claude.ai/_next/static/media/177b7db6a26ff4c3-s.p.woff2",
        "https://claude.ai/_next/static/media/183a0d33cd5ef006-s.p.woff2",
        "https://claude.ai/_next/static/media/2cc8547efe9f163a-s.p.woff2",
        "https://claude.ai/_next/static/media/2d21c5135ef46b39-s.p.woff2",
        "https://claude.ai/_next/static/media/3b066fe34f61f169-s.p.woff2",
        "https://claude.ai/_next/static/media/4e8887750eb14755-s.p.woff2",
        "https://claude.ai/_next/static/media/5cc13524e09f5d21-s.p.woff2",
        "https://claude.ai/_next/static/media/5fee9713a1748cc9-s.p.woff2",
        "https://claude.ai/_next/static/media/6a2030c2a5787e7a-s.p.woff2",
        "https://claude.ai/_next/static/media/8217ebd4682cfe49-s.p.woff2",
        "https://claude.ai/_next/static/media/a0eafab536ffd221-s.p.woff2",
        "https://claude.ai/_next/static/media/a72997480c14a9d4-s.p.woff2",
        "https://claude.ai/_next/static/media/ae9d065a0123ed8a-s.p.woff2",
        "https://claude.ai/_next/static/media/b8c97ebabd0473a4-s.p.woff2",
        "https://claude.ai/_next/static/media/b96accb76593e50d-s.p.woff2",
        "https://claude.ai/_next/static/media/cfe503504e29ad5d-s.p.woff2",
        "https://claude.ai/_next/static/media/d13ff1ddfcb21419-s.p.woff2",
        "https://claude.ai/_next/static/media/d4ad98ce6ee578c0-s.p.woff2",
        "https://claude.ai/_next/static/media/d7440d3c533a1aec-s.p.woff2",
        "https://claude.ai/_next/static/media/db2277a4dc542e54-s.p.woff2",
        "https://claude.ai/_next/static/media/f6f0b26c2c0e7b63-s.p.woff2",
    ]

    print("🚀 INSTANT AUTOMATION WEB OPENER")
    print("=" * 40)
    print(f"Ready to open {len(websites)} websites...")
    print()

    # Show what's about to be opened
    print("📋 Websites to open:")
    for i, url in enumerate(websites, 1):
        print(f"   {i}. {url}")
    print()

    # Confirmation
    try:
        choice = input("🔥 Ready to launch? (y/n): ").lower().strip()
        if choice not in ["y", "yes"]:
            print("✋ Operation cancelled. See you later!")
            return
    except KeyboardInterrupt:
        print("\n✋ Operation cancelled. See you later!")
        return

    print("\n🎯 Opening websites...")
    print("-" * 30)

    # Open each website
    success_count = 0
    for i, url in enumerate(websites, 1):
        try:
            print(f"🌐 Opening: Link {i}")
            webbrowser.open(url)
            success_count += 1
            time.sleep(0.5)  # Small delay to prevent overwhelming the system
        except Exception as e:
            print(f"❌ Failed to open Link {i}: {str(e)}")

    print(f"\n✅ Done! Successfully opened {success_count}/{len(websites)} websites")
    print("🎉 Your browsers are ready to go!")


if __name__ == "__main__":
    try:
        instant_web_opener()
    except KeyboardInterrupt:
        print("\n\n👋 Process interrupted. Goodbye!")
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ Unexpected error: {str(e)}")
        sys.exit(1)
