"""Verify key ownership without injecting input into the real computer."""
import sys
import unittest
from types import SimpleNamespace
from unittest.mock import patch

if sys.platform == 'win32':
    import input_windows as win


@unittest.skipUnless(sys.platform == 'win32', 'Windows input backend')
class WindowsKeyTests(unittest.TestCase):
    def setUp(self):
        self.events = []
        self.injector = win.Injector(SimpleNamespace(injections=0, blocked=0))
        self.injector._emit = self.events.append
        self.patch = patch.object(win, '_key_input',
                                  side_effect=lambda scan, vk, ext, keyup: (vk, not keyup))
        self.patch.start()
        self.addCleanup(self.patch.stop)

    def test_sticky_shift_survives_a_shortcut_that_also_uses_shift(self):
        self.injector.key('shift', 1)
        self.injector.key('ctrl+shift+z', 1)
        self.injector.key('ctrl+shift+z', 0)
        self.assertEqual(self.events, [(0x10, True), (0x11, True), (0x5a, True),
                                       (0x5a, False), (0x11, False)])
        self.injector.key('shift', 0)
        self.assertEqual(self.events[-1], (0x10, False))
        self.assertEqual(self.injector.key_refs, {})

    def test_aliases_share_ownership_and_duplicate_releases_are_harmless(self):
        self.injector.key('ctrl', 1)
        self.injector.key('control', 1)
        self.injector.key('ctrl', 0)
        self.injector.key('ctrl', 0)
        self.assertEqual(self.events, [(0x11, True)])
        self.injector.release_all()
        self.assertEqual(self.events, [(0x11, True), (0x11, False)])
        self.assertEqual(self.injector.keys_down, {})
        self.assertEqual(self.injector.key_refs, {})

    def test_disconnect_releases_shared_shift_and_all_other_keys_once(self):
        self.injector.key('shift', 1)
        self.injector.key('shift+a', 1)
        self.injector.key('shift+a', 1)
        self.injector.release_all()
        self.injector.release_all()
        self.assertEqual(self.events, [(0x10, True), (0x41, True),
                                       (0x41, False), (0x10, False)])
        self.assertEqual(self.injector.key_refs, {})
