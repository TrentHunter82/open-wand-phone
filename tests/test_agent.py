"""Read-only Windows agent integration tests; never inject real input."""
import unittest
from unittest.mock import Mock, patch

from aiohttp import WSServerHandshakeError
from aiohttp.test_utils import TestClient, TestServer
import agent


class CursorFeedbackTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.injector = Mock(absolute=True, blocked_at=0)
        self.client = TestClient(TestServer(agent.make_app(
            "test-only-token", self.injector, agent.Stats(), False)))
        await self.client.start_server()

    async def asyncTearDown(self):
        await self.client.close()

    async def test_feedback_is_authenticated_and_does_not_inject(self):
        with self.assertRaises(WSServerHandshakeError):
            await self.client.ws_connect('/ws?k=wrong')
        ws = await self.client.ws_connect('/ws?k=test-only-token')
        hello = await ws.receive_json()
        self.assertTrue(hello['cursor_feedback'])
        monitors = [{'x': -1920, 'y': -100, 'w': 1920, 'h': 1080}]
        with patch.object(agent, 'cursor_pos', return_value=(-1, 50)), \
             patch.object(agent, 'virtual_rect', return_value=(-1920, -100, 3840, 1180)), \
             patch.object(agent, 'monitor_rects', return_value=monitors):
            await ws.send_json({'t': 'cursor'})
            report = await ws.receive_json()
        self.assertEqual((report['x'], report['y']), (-1, 50))
        self.assertEqual(report['monitors'], monitors)
        self.assertEqual(report['desktop']['x'], -1920)
        self.injector.move.assert_not_called()
        self.injector.key.assert_not_called()
        self.injector.button.assert_not_called()
        await ws.close()

    def test_real_monitor_enumeration_is_read_only(self):
        agent.set_dpi_aware()
        rects = agent.monitor_rects()
        self.assertGreater(len(rects), 0)
        self.assertTrue(all(r['w'] > 0 and r['h'] > 0 for r in rects))


if __name__ == '__main__':
    unittest.main()
