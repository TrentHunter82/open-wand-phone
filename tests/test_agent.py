"""Read-only agent integration tests; never inject real input."""
import runpy
import sys
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
        self.assertEqual(hello['platform'], sys.platform)
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

    def test_mac_server_import_does_not_load_windows_backend(self):
        with patch.object(sys, 'platform', 'darwin'), \
             patch.dict(sys.modules, {'input_windows': None}):
            module = runpy.run_path(str(agent.HERE / 'agent.py'), run_name='agent_mac_test')
        self.assertEqual(module['Injector'].__module__, 'input_macos')

    async def test_dial_assets_are_served_and_private_files_are_not(self):
        for path in ('dial.css', 'dial-model.js', 'dial-glass.js', 'dial.js'):
            response = await self.client.get('/' + path)
            self.assertEqual(response.status, 200)
            self.assertEqual(response.headers['Cache-Control'], 'no-store')
            self.assertGreater(len(await response.read()), 100)
        response = await self.client.get('/wand-token.txt')
        self.assertEqual(response.status, 404)


if __name__ == '__main__':
    unittest.main()
