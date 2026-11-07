"""Exercise the macOS backend without posting input to the real computer."""
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import input_macos as mac


class QuartzStub:
    kCGHIDEventTap = 0
    kCGMouseButtonLeft, kCGMouseButtonRight = 0, 1
    kCGEventMouseMoved = 5
    kCGEventLeftMouseDown, kCGEventLeftMouseUp, kCGEventLeftMouseDragged = 1, 2, 6
    kCGEventRightMouseDown, kCGEventRightMouseUp, kCGEventRightMouseDragged = 3, 4, 7
    kCGScrollEventUnitPixel = 0
    kCGEventFlagMaskCommand = 1 << 20
    kCGEventFlagMaskShift = 1 << 17
    kCGEventFlagMaskAlternate = 1 << 19
    kCGEventFlagMaskControl = 1 << 18
    kCGEventFlagMaskAlphaShift = 1 << 16

    def __init__(self):
        self.allowed = True
        self.events = []
        self.requested = False

    def CGPreflightPostEventAccess(self):
        return self.allowed

    def CGRequestPostEventAccess(self):
        self.requested = True

    def CGEventCreateMouseEvent(self, source, kind, point, button):
        return dict(kind=kind, point=point, button=button)

    def CGEventCreateKeyboardEvent(self, source, code, down):
        return dict(code=code, down=down)

    def CGEventCreateScrollWheelEvent(self, source, unit, axes, delta):
        return dict(scroll=delta)

    def CGEventSetFlags(self, event, flags):
        event['flags'] = flags

    def CGEventPost(self, tap, event):
        self.events.append(event)


class MacInputTests(unittest.TestCase):
    def setUp(self):
        self.q = QuartzStub()
        self.patch = patch.object(mac, 'quartz', return_value=self.q)
        self.patch.start()
        self.addCleanup(self.patch.stop)
        self.stats = SimpleNamespace(injections=0, blocked=0)
        self.injector = mac.Injector(self.stats)

    def test_permission_denial_explains_setup_and_sends_nothing(self):
        self.q.allowed = False
        with self.assertRaisesRegex(SystemExit, 'Accessibility'):
            mac.Injector(self.stats)
        self.assertTrue(self.q.requested)
        self.assertEqual(self.q.events, [])

    def test_f8_is_a_function_key_and_command_combo_releases_in_reverse(self):
        self.injector.key('f8', 1)
        self.injector.key('f8', 0)
        self.assertEqual([(e['code'], e['down']) for e in self.q.events], [(100, True), (100, False)])
        self.q.events.clear()
        self.injector.key('cmd+c', 1)
        self.injector.key('cmd+c', 0)
        self.assertEqual([(e['code'], e['down']) for e in self.q.events],
                         [(55, True), (8, True), (8, False), (55, False)])
        self.assertEqual([e['flags'] for e in self.q.events], [1 << 20]*3 + [0])

    def test_simultaneous_shortcuts_keep_shared_modifier_until_last_release(self):
        self.injector.key('cmd+c', 1)
        self.injector.key('cmd+v', 1)
        self.injector.key('cmd+c', 0)
        self.assertEqual(self.injector.key_refs[55], 1)
        self.assertFalse(any(e.get('code') == 55 and not e['down'] for e in self.q.events))
        self.injector.release_all()
        self.assertEqual(self.injector.key_refs, {})
        self.assertEqual(self.q.events[-1], dict(code=55, down=False, flags=0))

    def test_sticky_shift_survives_command_shift_shortcuts_and_mouse_clicks(self):
        self.injector.key('shift', 1)
        self.injector.key('cmd+shift+z', 1)
        self.injector.key('cmd+shift+z', 0)
        self.assertEqual(self.injector.key_refs[56], 1)
        self.assertFalse(any(e.get('code') == 56 and not e['down'] for e in self.q.events))
        with patch.object(mac, 'cursor_pos', return_value=(30, 40)):
            self.injector.button('l', 1)
            self.injector.button('l', 0)
        self.assertEqual(self.q.events[-1]['flags'], self.q.kCGEventFlagMaskShift)
        self.injector.release_all()
        self.assertEqual(self.q.events[-1], dict(code=56, down=False, flags=0))

    def test_drag_movement_and_disconnect_release(self):
        with patch.object(mac, 'cursor_pos', return_value=(30, 40)), \
             patch.object(mac, 'monitor_rects', return_value=[dict(x=0, y=0, w=100, h=100)]):
            self.injector.button('l', 1)
            self.injector.move(10, 12)
            self.assertEqual(self.q.events[-1]['kind'], self.q.kCGEventLeftMouseDragged)
            self.assertEqual(self.q.events[-1]['point'], (40, 52))
            self.injector.key('f8', 1)
            self.injector.release_all()
        self.assertFalse(self.injector.held)
        self.assertFalse(self.injector.keys_down)
        self.assertEqual(self.q.events[-2]['kind'], self.q.kCGEventLeftMouseUp)
        self.assertFalse(self.q.events[-1]['down'])

    def test_negative_display_bounds_and_gaps(self):
        displays = [dict(x=-200, y=0, w=100, h=100), dict(x=0, y=0, w=100, h=100)]
        with patch.object(mac, 'monitor_rects', return_value=displays), \
             patch.object(mac, 'cursor_pos', return_value=(-150, 50)):
            self.assertEqual(mac.virtual_rect(), (-200, 0, 300, 100))
            self.injector.move(65, 0)
            self.assertEqual(self.q.events[-1]['point'], (-101, 50))

    def test_fractional_scroll_invalid_deltas_and_permission_revocation(self):
        self.injector.wheel(float('nan'))
        self.injector.wheel(0.01)
        self.injector.wheel(0.02)
        self.assertEqual(len(self.q.events), 1)
        self.assertEqual(self.q.events[0]['scroll'], 1)
        self.q.allowed = False
        self.injector.key('f8', 1)
        self.assertEqual(len(self.q.events), 1)
        self.assertEqual(self.stats.blocked, 1)
        self.assertGreater(self.injector.blocked_at, 0)

    def test_unknown_keys_are_rejected_without_partial_modifiers(self):
        for spec in ('cmd+f24', 'ctrl+', 'printscreen', 'cmd+unknown'):
            self.injector.key(spec, 1)
        self.assertEqual(self.q.events, [])
        self.assertEqual(self.injector.keys_down, {})
        self.assertEqual(mac.parse_combo('c+cmd'), [55, 8])


if __name__ == '__main__':
    unittest.main()
