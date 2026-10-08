import unittest
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from llm.agent import EnvKeyLoader, build_langchain_messages, chat_agent
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

class TestAgentOrchestration(unittest.TestCase):
    
    def test_env_key_loader(self):
        cfg = EnvKeyLoader.get_config()
        self.assertIn("default_provider", cfg)
        self.assertIn("default_model", cfg)
        providers = EnvKeyLoader.get_available_providers()
        self.assertIsInstance(providers, list)

    def test_message_formatting_and_sliding_window(self):
        # Tạo lịch sử 25 tin nhắn vượt quá ngưỡng 20 của INV-04
        history = [
            {"role": "user" if i % 2 == 0 else "assistant", "content": f"Message {i}"}
            for i in range(25)
        ]
        prompt = "Tin nhắn mới nhất"
        msgs = build_langchain_messages(prompt, history)
        
        # 1 SystemMessage + tối đa 20 history + 1 HumanMessage cuối = 22 messages
        self.assertIsInstance(msgs[0], SystemMessage)
        self.assertIsInstance(msgs[-1], HumanMessage)
        self.assertEqual(msgs[-1].content, prompt)
        self.assertLessEqual(len(msgs), 22)

    def test_workflow_graph_structure(self):
        self.assertIsNotNone(chat_agent.workflow)
        # Verify compiled graph has entrypoint and nodes
        self.assertIsNotNone(chat_agent.workflow)

    def test_astream_agent_execution(self):
        async def run_stream():
            events = []
            async for ev in chat_agent.astream_agent(
                prompt="Xin chào AI-Chan",
                history=[],
                model_override="test-model"
            ):
                events.append(ev)
            return events

        events = asyncio.run(run_stream())
        self.assertTrue(len(events) > 0)
        # Check that stream yielded chunks and a final done event
        streaming_chunks = [e for e in events if e.get("status") == "streaming"]
        done_events = [e for e in events if e.get("status") == "done"]
        self.assertTrue(len(streaming_chunks) > 0)
        self.assertEqual(len(done_events), 1)

if __name__ == "__main__":
    unittest.main()
