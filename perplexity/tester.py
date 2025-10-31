#!/usr/bin/env python3
"""
Perplexity API Comprehensive Tester
Tests all models and features with raw output display
"""

import os
import json
import requests
from datetime import datetime
from typing import Optional, Dict, Any

class PerplexityTester:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://api.perplexity.ai/chat/completions"
        self.models = [
            "sonar",
            "sonar-pro",
            "sonar-reasoning",
            "sonar-reasoning-pro",
            "sonar-deep-research",
            "r1-1776"
        ]
        self.test_results = []
        
    def make_request(self, model: str, messages: list, 
                    reasoning_effort: Optional[str] = None,
                    search_domain_filter: Optional[list] = None,
                    stream: bool = False) -> Dict[str, Any]:
        """Make API request with full parameter support"""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": model,
            "messages": messages
        }
        
        # Add optional parameters
        if reasoning_effort and "reasoning" in model:
            payload["reasoning_effort"] = reasoning_effort
            
        if search_domain_filter:
            payload["search_domain_filter"] = search_domain_filter
            
        if stream:
            payload["stream"] = True
            
        try:
            response = requests.post(
                self.base_url,
                headers=headers,
                json=payload,
                timeout=120,
                stream=stream
            )
            
            if stream:
                return self._handle_streaming_response(response)
            else:
                response.raise_for_status()
                return {
                    "success": True,
                    "status_code": response.status_code,
                    "data": response.json(),
                    "raw_response": response.text
                }
                
        except requests.exceptions.RequestException as e:
            return {
                "success": False,
                "error": str(e),
                "status_code": getattr(e.response, 'status_code', None),
                "raw_response": getattr(e.response, 'text', None)
            }
    
    def _handle_streaming_response(self, response) -> Dict[str, Any]:
        """Handle streaming responses"""
        chunks = []
        full_content = ""
        
        try:
            for line in response.iter_lines():
                if line:
                    line_text = line.decode('utf-8')
                    if line_text.startswith('data: '):
                        chunk_data = line_text[6:]
                        if chunk_data.strip() == '[DONE]':
                            break
                        try:
                            chunk_json = json.loads(chunk_data)
                            chunks.append(chunk_json)
                            if 'choices' in chunk_json:
                                delta = chunk_json['choices'][0].get('delta', {})
                                if 'content' in delta:
                                    full_content += delta['content']
                        except json.JSONDecodeError:
                            continue
            
            return {
                "success": True,
                "status_code": 200,
                "streaming": True,
                "full_content": full_content,
                "chunks": chunks,
                "chunk_count": len(chunks)
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "streaming": True
            }
    
    def test_model(self, model: str, prompt: str, **kwargs):
        """Test a specific model with given prompt"""
        print(f"\n{'='*70}")
        print(f"🧪 TESTING MODEL: {model.upper()}")
        print(f"{'='*70}")
        print(f"📝 Prompt: {prompt}")
        print(f"⏰ Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        
        messages = [{"role": "user", "content": prompt}]
        
        print("\n🚀 Sending request...")
        result = self.make_request(model, messages, **kwargs)
        
        print("\n" + "="*70)
        print("📊 RAW RESPONSE:")
        print("="*70)
        
        if result["success"]:
            if result.get("streaming"):
                print(f"\n✅ Streaming Success!")
                print(f"Chunks received: {result['chunk_count']}")
                print(f"\n📝 Full Content:\n{result['full_content'][:500]}...")
                print(f"\n🔍 Sample Chunks (first 2):")
                for i, chunk in enumerate(result['chunks'][:2]):
                    print(f"\nChunk {i+1}:")
                    print(json.dumps(chunk, indent=2)[:300])
            else:
                print(json.dumps(result["data"], indent=2))
                
                # Extract and display key metrics
                if "usage" in result["data"]:
                    print("\n" + "="*70)
                    print("💰 USAGE & COST METRICS:")
                    print("="*70)
                    usage = result["data"]["usage"]
                    print(json.dumps(usage, indent=2))
                
                # Display the actual content
                if "choices" in result["data"]:
                    print("\n" + "="*70)
                    print("💬 AI RESPONSE:")
                    print("="*70)
                    content = result["data"]["choices"][0]["message"]["content"]
                    print(content[:1000])  # First 1000 chars
                    if len(content) > 1000:
                        print(f"\n... (truncated, total length: {len(content)} chars)")
                
                # Display citations if available
                if "citations" in result["data"]:
                    print("\n" + "="*70)
                    print("📚 CITATIONS:")
                    print("="*70)
                    for i, citation in enumerate(result["data"]["citations"][:5]):
                        print(f"{i+1}. {citation}")
        else:
            print(f"\n❌ Error: {result['error']}")
            print(f"Status Code: {result.get('status_code')}")
            if result.get('raw_response'):
                print(f"\nRaw Error Response:\n{result['raw_response'][:500]}")
        
        print("\n" + "="*70 + "\n")
        
        # Save to results
        self.test_results.append({
            "model": model,
            "prompt": prompt,
            "timestamp": datetime.now().isoformat(),
            "result": result,
            "kwargs": kwargs
        })
        
        return result
    
    def test_all_models(self, prompt: str = "What is quantum computing?"):
        """Test all available models with the same prompt"""
        print("\n" + "="*70)
        print("🎯 TESTING ALL MODELS")
        print("="*70)
        print(f"Models to test: {len(self.models)}")
        print(f"Test prompt: {prompt}")
        
        for model in self.models:
            # Add reasoning_effort for reasoning models
            kwargs = {}
            if "reasoning" in model:
                kwargs["reasoning_effort"] = "medium"
            
            self.test_model(model, prompt, **kwargs)
            
            # Small delay between requests
            import time
            time.sleep(2)
        
        print("\n✅ All models tested!")
    
    def test_streaming(self, model: str = "sonar", prompt: str = "Explain AI in simple terms"):
        """Test streaming capability"""
        print("\n" + "="*70)
        print("🌊 TESTING STREAMING MODE")
        print("="*70)
        
        return self.test_model(model, prompt, stream=True)
    
    def test_domain_filter(self, domains: list = None):
        """Test search domain filtering"""
        if domains is None:
            domains = ["wikipedia.org", "nature.com"]
        
        print("\n" + "="*70)
        print("🔍 TESTING DOMAIN FILTER")
        print("="*70)
        print(f"Allowed domains: {domains}")
        
        prompt = "What are the latest discoveries in quantum physics?"
        return self.test_model(
            "sonar-pro",
            prompt,
            search_domain_filter=domains
        )
    
    def test_reasoning_efforts(self):
        """Test different reasoning effort levels"""
        print("\n" + "="*70)
        print("🧠 TESTING REASONING EFFORT LEVELS")
        print("="*70)
        
        prompt = "Should I invest in tech stocks or bonds given current economic conditions?"
        efforts = ["low", "medium", "high"]
        
        for effort in efforts:
            print(f"\n🎚️  Testing effort level: {effort.upper()}")
            self.test_model(
                "sonar-reasoning-pro",
                prompt,
                reasoning_effort=effort
            )
    
    def test_deep_research(self, topic: str = None):
        """Test deep research capability"""
        if topic is None:
            topic = "What are the most promising AI startups in Southeast Asia in 2025?"
        
        print("\n" + "="*70)
        print("🔬 TESTING DEEP RESEARCH")
        print("="*70)
        print("⚠️  WARNING: This may take 30-60 seconds and will cost more!")
        
        input("Press Enter to continue or Ctrl+C to cancel...")
        
        return self.test_model("sonar-deep-research", topic)
    
    def save_results(self, filename: str = None):
        """Save test results to file"""
        if filename is None:
            filename = f"perplexity_test_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        
        filepath = f"/home/claude/{filename}"
        
        with open(filepath, 'w') as f:
            json.dump(self.test_results, f, indent=2, default=str)
        
        print(f"\n💾 Results saved to: {filepath}")
        return filepath
    
    def display_summary(self):
        """Display test summary"""
        print("\n" + "="*70)
        print("📊 TEST SUMMARY")
        print("="*70)
        
        successful = sum(1 for r in self.test_results if r["result"]["success"])
        failed = len(self.test_results) - successful
        
        print(f"Total tests: {len(self.test_results)}")
        print(f"✅ Successful: {successful}")
        print(f"❌ Failed: {failed}")
        
        print("\n🎯 Models tested:")
        for result in self.test_results:
            status = "✅" if result["result"]["success"] else "❌"
            print(f"  {status} {result['model']}")


def main_menu():
    """Main menu for interactive testing"""
    print("""
    ╔═══════════════════════════════════════════════════════════════╗
    ║                                                               ║
    ║       🚀 PERPLEXITY API COMPREHENSIVE TESTER 🚀              ║
    ║                                                               ║
    ║            Your $299 API Testing Platform                     ║
    ║                                                               ║
    ╚═══════════════════════════════════════════════════════════════╝
    """)

    # Get API key from environment or input
    api_key = (
        os.environ.get("PERPLEXITY_API_KEY")
        or "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"
    )

    if not api_key:
        print("\n⚠️  PERPLEXITY_API_KEY not found in environment!")
        api_key = input("Enter your Perplexity API key: ").strip()

        if not api_key:
            print("❌ API key required!")
            return

    tester = PerplexityTester(api_key)

    while True:
        print("\n" + "="*70)
        print("🎮 MAIN MENU")
        print("="*70)
        print("1. 🧪 Test Single Model")
        print("2. 🎯 Test All Models (same prompt)")
        print("3. 🌊 Test Streaming")
        print("4. 🔍 Test Domain Filter")
        print("5. 🧠 Test Reasoning Efforts (low/medium/high)")
        print("6. 🔬 Test Deep Research (WARNING: Expensive!)")
        print("7. 📝 Custom Test")
        print("8. 💾 Save Results")
        print("9. 📊 Show Summary")
        print("0. 🚪 Exit")
        print("="*70)

        choice = input("\n👉 Choose option (0-9): ").strip()

        try:
            if choice == '1':
                print("\nAvailable models:")
                for i, model in enumerate(tester.models, 1):
                    print(f"  {i}. {model}")
                model_choice = int(input("Choose model number: ")) - 1
                prompt = input("Enter prompt: ")

                model = tester.models[model_choice]
                kwargs = {}
                if "reasoning" in model:
                    effort = input("Reasoning effort (low/medium/high, default=medium): ").strip() or "medium"
                    kwargs["reasoning_effort"] = effort

                tester.test_model(model, prompt, **kwargs)

            elif choice == '2':
                prompt = input("Enter test prompt (or press Enter for default): ").strip()
                if not prompt:
                    prompt = "What is quantum computing?"
                tester.test_all_models(prompt)

            elif choice == '3':
                model = input("Model (default=sonar): ").strip() or "sonar"
                prompt = input("Prompt: ").strip() or "Explain AI in simple terms"
                tester.test_streaming(model, prompt)

            elif choice == '4':
                domains = input("Enter domains (comma-separated, default=wikipedia.org,nature.com): ").strip()
                if domains:
                    domains = [d.strip() for d in domains.split(',')]
                else:
                    domains = ["wikipedia.org", "nature.com"]
                tester.test_domain_filter(domains)

            elif choice == '5':
                tester.test_reasoning_efforts()

            elif choice == '6':
                topic = input("Enter research topic (or Enter for default): ").strip()
                if not topic:
                    topic = None
                tester.test_deep_research(topic)

            elif choice == '7':
                model = input("Model name: ")
                prompt = input("Prompt: ")

                kwargs = {}
                if input("Add reasoning_effort? (y/n): ").lower() == 'y':
                    kwargs["reasoning_effort"] = input("Effort (low/medium/high): ")

                if input("Add domain filter? (y/n): ").lower() == 'y':
                    domains = input("Domains (comma-separated): ").split(',')
                    kwargs["search_domain_filter"] = [d.strip() for d in domains]

                if input("Use streaming? (y/n): ").lower() == 'y':
                    kwargs["stream"] = True

                tester.test_model(model, prompt, **kwargs)

            elif choice == '8':
                filename = input("Filename (or Enter for auto): ").strip() or None
                tester.save_results(filename)

            elif choice == '9':
                tester.display_summary()

            elif choice == '0':
                print("\n👋 Thanks for testing! Good luck with your startup!")
                if tester.test_results:
                    save = input("Save results before exit? (y/n): ").lower()
                    if save == 'y':
                        tester.save_results()
                break

            else:
                print("❌ Invalid choice!")

        except KeyboardInterrupt:
            print("\n\n⏸️  Test interrupted!")
        except Exception as e:
            print(f"\n❌ Error: {e}")
            import traceback
            traceback.print_exc()

    print("\n✨ All done! Check your saved results for analysis.\n")


if __name__ == "__main__":
    main_menu()
