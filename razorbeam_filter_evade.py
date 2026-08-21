from __future__ import annotations

import os
import json
import sys
from pathlib import Path

APP_DATA_DIR = (
    Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
    / "RazorbeamCollectibles"
    / "RazorbeamFilterEvade"
)
CONFIG_PATH = APP_DATA_DIR / "config.json"
DEPENDENCY_DIR = (
    APP_DATA_DIR / "python_deps"
)
if DEPENDENCY_DIR.exists():
    sys.path.insert(0, str(DEPENDENCY_DIR))

from PySide6 import QtCore, QtGui, QtWidgets

from homoglyph_replacer import replace_letters


APP_DIR = Path(__file__).resolve().parent
APP_ICON = APP_DIR / "razorbeam_filter_evade.ico"
DEFAULT_WINDOW_SIZE = QtCore.QSize(370, 424)
TWEET_LIMIT = 280

UI_COLORS = {
    "window_background": "#202020",
    "input_background": "#151515",
    "panel_background": "#1e1e1e",
    "panel_hover": "#2a2a2a",
    "border": "#303030",
    "strong_border": "#404040",
    "text": "#ffffff",
    "accent": "#6802a7",
    "progress": "#911bff",
    "success": "#00ff00",
    "error": "#ff0000",
    "warning": "#ffff00",
}

LOG_COLORS = {
    "date": "#ffffff",
    "time": "#adadad",
    "metadata": "#636363",
    "text": "#8200f0",
    "link": "#4754ff",
    "search_highlight": "#ef0fff",
    "error": "#ff0000",
    "alert": "#ffaa00",
    "success": "#00e52b",
}


def apply_application_theme(app: QtWidgets.QApplication) -> None:
    palette = QtGui.QPalette()
    palette.setColor(QtGui.QPalette.ColorRole.Window, QtGui.QColor(UI_COLORS["window_background"]))
    palette.setColor(QtGui.QPalette.ColorRole.WindowText, QtGui.QColor(UI_COLORS["text"]))
    palette.setColor(QtGui.QPalette.ColorRole.Base, QtGui.QColor(UI_COLORS["input_background"]))
    palette.setColor(QtGui.QPalette.ColorRole.AlternateBase, QtGui.QColor(UI_COLORS["window_background"]))
    palette.setColor(QtGui.QPalette.ColorRole.ToolTipBase, QtGui.QColor(UI_COLORS["input_background"]))
    palette.setColor(QtGui.QPalette.ColorRole.ToolTipText, QtGui.QColor(UI_COLORS["text"]))
    palette.setColor(QtGui.QPalette.ColorRole.Text, QtGui.QColor(UI_COLORS["text"]))
    palette.setColor(QtGui.QPalette.ColorRole.Button, QtGui.QColor(UI_COLORS["window_background"]))
    palette.setColor(QtGui.QPalette.ColorRole.ButtonText, QtGui.QColor(UI_COLORS["text"]))
    palette.setColor(QtGui.QPalette.ColorRole.BrightText, QtGui.QColor(UI_COLORS["error"]))
    palette.setColor(QtGui.QPalette.ColorRole.Link, QtGui.QColor(LOG_COLORS["link"]))
    palette.setColor(QtGui.QPalette.ColorRole.Highlight, QtGui.QColor(UI_COLORS["accent"]))
    palette.setColor(QtGui.QPalette.ColorRole.HighlightedText, QtGui.QColor(UI_COLORS["text"]))
    app.setPalette(palette)
    app.setFont(QtGui.QFont("Segoe UI", 9))

    app.setStyleSheet(
        f"""
        QMainWindow, QWidget {{
            background-color: {UI_COLORS["window_background"]};
            color: {UI_COLORS["text"]};
        }}
        QGroupBox {{
            background-color: {UI_COLORS["panel_background"]};
            border: 1px solid {UI_COLORS["border"]};
            margin-top: 10px;
            padding: 10px 8px 8px 8px;
        }}
        QGroupBox::title {{
            subcontrol-origin: margin;
            left: 8px;
            padding: 0 4px;
            color: {UI_COLORS["text"]};
        }}
        QPlainTextEdit {{
            background-color: {UI_COLORS["input_background"]};
            color: {UI_COLORS["text"]};
            border: 1px solid {UI_COLORS["strong_border"]};
            selection-background-color: {UI_COLORS["accent"]};
            selection-color: {UI_COLORS["text"]};
        }}
        QPushButton {{
            background-color: {UI_COLORS["panel_background"]};
            color: {UI_COLORS["text"]};
            border: 1px solid {UI_COLORS["strong_border"]};
            border-radius: 4px;
            padding: 7px 14px;
            min-height: 18px;
        }}
        QPushButton:hover {{
            background-color: {UI_COLORS["panel_hover"]};
            border-color: {UI_COLORS["accent"]};
        }}
        QPushButton:pressed {{
            background-color: {UI_COLORS["accent"]};
        }}
        QPushButton#primaryButton {{
            background-color: {UI_COLORS["accent"]};
            border-color: {UI_COLORS["progress"]};
            font-weight: bold;
        }}
        QPushButton#primaryButton:hover {{
            background-color: {UI_COLORS["progress"]};
        }}
        QCheckBox {{
            spacing: 6px;
        }}
        QStatusBar {{
            background-color: {UI_COLORS["window_background"]};
            color: {LOG_COLORS["metadata"]};
        }}
        QToolTip {{
            color: {UI_COLORS["text"]};
            background-color: {UI_COLORS["input_background"]};
            border: 1px solid {UI_COLORS["strong_border"]};
        }}
        """
    )


class CursorTooltipFilter(QtCore.QObject):
    def __init__(self, tooltip_text: str, parent: QtCore.QObject | None = None) -> None:
        super().__init__(parent)
        self.tooltip_text = f" {tooltip_text} "
        self.popup: QtWidgets.QLabel | None = None

    def ensure_popup(self) -> None:
        if self.popup is not None:
            return
        self.popup = QtWidgets.QLabel()
        self.popup.setWindowFlags(QtCore.Qt.WindowType.ToolTip)
        self.popup.setAttribute(QtCore.Qt.WidgetAttribute.WA_ShowWithoutActivating, True)
        self.popup.setAttribute(QtCore.Qt.WidgetAttribute.WA_TransparentForMouseEvents, True)
        self.popup.setStyleSheet(
            f"QLabel {{ color: {UI_COLORS['text']}; background-color: {UI_COLORS['input_background']}; "
            f"border: 1px solid {UI_COLORS['strong_border']}; padding: 2px 0px; }}"
        )
        self.popup.setTextFormat(QtCore.Qt.TextFormat.RichText)
        self.popup.setText(self.tooltip_text)
        self.popup.adjustSize()

    def hide_tooltip(self) -> None:
        if self.popup is not None:
            self.popup.hide()

    def eventFilter(self, watched: QtCore.QObject, event: QtCore.QEvent) -> bool:
        if event.type() in (QtCore.QEvent.Type.Enter, QtCore.QEvent.Type.MouseMove):
            self.ensure_popup()
            if event.type() == QtCore.QEvent.Type.MouseMove and isinstance(event, QtGui.QMouseEvent):
                global_pos = watched.mapToGlobal(event.position().toPoint())
            else:
                global_pos = QtGui.QCursor.pos()
            self.popup.move(global_pos + QtCore.QPoint(12, 18))
            self.popup.adjustSize()
            if not self.popup.isVisible():
                self.popup.show()
            return False
        if event.type() in (
            QtCore.QEvent.Type.Leave,
            QtCore.QEvent.Type.HoverLeave,
            QtCore.QEvent.Type.FocusOut,
        ):
            self.hide_tooltip()
            return False
        return False


class InputTextEdit(QtWidgets.QPlainTextEdit):
    enter_pressed = QtCore.Signal()

    def keyPressEvent(self, event: QtGui.QKeyEvent) -> None:
        if event.key() in (QtCore.Qt.Key.Key_Return, QtCore.Qt.Key.Key_Enter):
            if event.modifiers() & QtCore.Qt.KeyboardModifier.ShiftModifier:
                super().keyPressEvent(event)
                return
            self.enter_pressed.emit()
            event.accept()
            return
        super().keyPressEvent(event)


class RazorbeamFilterEvadeWindow(QtWidgets.QMainWindow):
    def __init__(self) -> None:
        super().__init__()
        self.setWindowTitle("Razorbeam Filter Evade")
        if APP_ICON.exists():
            self.setWindowIcon(QtGui.QIcon(str(APP_ICON)))
        self.resize(DEFAULT_WINDOW_SIZE)

        central = QtWidgets.QWidget()
        central.setFont(QtGui.QFont("Segoe UI", 9))
        layout = QtWidgets.QVBoxLayout(central)
        layout.setContentsMargins(10, 10, 10, 8)
        layout.setSpacing(8)

        input_group = QtWidgets.QGroupBox("Input")
        input_layout = QtWidgets.QVBoxLayout(input_group)
        self.input_box = InputTextEdit()
        self.input_box.setPlaceholderText("Type or paste text here")
        input_layout.addWidget(self.input_box)

        output_group = QtWidgets.QGroupBox("Output")
        output_layout = QtWidgets.QVBoxLayout(output_group)
        self.output_box = QtWidgets.QPlainTextEdit()
        self.output_box.setReadOnly(True)
        self.output_box.setFont(QtGui.QFont("Consolas", 10))
        output_layout.addWidget(self.output_box)

        controls = QtWidgets.QVBoxLayout()
        controls.setSpacing(4)
        top_controls = QtWidgets.QHBoxLayout()
        bottom_controls = QtWidgets.QHBoxLayout()

        self.enter_copy_checkbox = QtWidgets.QCheckBox("Enter key copies to clipboard")
        self.enter_copy_checkbox.setChecked(False)
        self.enter_copy_tooltip = CursorTooltipFilter(
            "Shift-enter to line break.<br>Tab key <i>always</i> copies to clipboard.",
            self.enter_copy_checkbox,
        )
        self.enter_copy_checkbox.installEventFilter(self.enter_copy_tooltip)
        self.always_on_top_checkbox = QtWidgets.QCheckBox("Always on top")
        self.always_on_top_checkbox.setChecked(False)
        self.copy_button = QtWidgets.QPushButton("Copy output")
        self.copy_button.setObjectName("primaryButton")

        top_controls.addWidget(self.always_on_top_checkbox)
        top_controls.addStretch()
        bottom_controls.addWidget(self.enter_copy_checkbox)
        bottom_controls.addStretch()
        bottom_controls.addWidget(self.copy_button)
        controls.addLayout(top_controls)
        controls.addLayout(bottom_controls)

        layout.addWidget(input_group, 1)
        layout.addWidget(output_group, 1)
        layout.addLayout(controls)
        self.setCentralWidget(central)

        self.status = QtWidgets.QStatusBar()
        self.setStatusBar(self.status)

        self.input_box.textChanged.connect(self.convert)
        self.input_box.enter_pressed.connect(self.on_input_enter_pressed)
        self.copy_button.clicked.connect(self.copy_output)
        self.enter_copy_checkbox.toggled.connect(self.save_config)
        self.always_on_top_checkbox.toggled.connect(self.on_always_on_top_toggled)
        app = QtWidgets.QApplication.instance()
        if app is not None:
            app.installEventFilter(self)
        self.config = self.load_config()
        self.apply_config()

    def eventFilter(self, watched: QtCore.QObject, event: QtCore.QEvent) -> bool:
        if (
            event.type() == QtCore.QEvent.Type.KeyPress
            and isinstance(event, QtGui.QKeyEvent)
            and event.key() == QtCore.Qt.Key.Key_Tab
            and self.isActiveWindow()
        ):
            self.copy_output()
            event.accept()
            return True
        return super().eventFilter(watched, event)

    def load_config(self) -> dict:
        if not CONFIG_PATH.exists():
            return {}
        try:
            data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {}
        return data if isinstance(data, dict) else {}

    def save_config(self, _checked: bool | None = None) -> None:
        rect = self.geometry()
        data = {
            "geometry": [rect.x(), rect.y(), rect.width(), rect.height()],
            "enter_copies_to_clipboard": self.enter_copy_checkbox.isChecked(),
            "always_on_top": self.always_on_top_checkbox.isChecked(),
        }
        try:
            APP_DATA_DIR.mkdir(parents=True, exist_ok=True)
            CONFIG_PATH.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
        except OSError:
            pass

    def apply_config(self) -> None:
        enter_blocked = self.enter_copy_checkbox.blockSignals(True)
        top_blocked = self.always_on_top_checkbox.blockSignals(True)
        self.enter_copy_checkbox.setChecked(bool(self.config.get("enter_copies_to_clipboard", False)))
        self.always_on_top_checkbox.setChecked(bool(self.config.get("always_on_top", False)))
        self.enter_copy_checkbox.blockSignals(enter_blocked)
        self.always_on_top_checkbox.blockSignals(top_blocked)
        self.restore_geometry(self.config.get("geometry"))
        self.apply_always_on_top(self.always_on_top_checkbox.isChecked())

    def restore_geometry(self, geometry: object) -> None:
        if not isinstance(geometry, list) or len(geometry) != 4:
            return
        try:
            rect = QtCore.QRect(*(int(value) for value in geometry))
        except (TypeError, ValueError):
            return
        if rect.width() < 260 or rect.height() < 260:
            return
        screens = QtWidgets.QApplication.screens()
        if screens and not any(screen.availableGeometry().intersects(rect) for screen in screens):
            return
        self.setGeometry(rect)

    def convert(self) -> None:
        source = self.input_box.toPlainText()
        result = replace_letters(source)
        self.output_box.setPlainText(result)
        self.highlight_over_limit(self.input_box)
        self.highlight_over_limit(self.output_box)
        changed = sum(1 for left, right in zip(source, result) if left != right)
        self.status.showMessage(f"Converted {changed} character(s).")

    def highlight_over_limit(self, widget: QtWidgets.QPlainTextEdit) -> None:
        text = widget.toPlainText()
        if len(text) <= TWEET_LIMIT:
            widget.setExtraSelections([])
            return
        cursor = widget.textCursor()
        cursor.setPosition(TWEET_LIMIT)
        cursor.setPosition(len(text), QtGui.QTextCursor.MoveMode.KeepAnchor)
        selection = QtWidgets.QTextEdit.ExtraSelection()
        selection.cursor = cursor
        selection.format.setBackground(QtGui.QColor(UI_COLORS["accent"]))
        selection.format.setForeground(QtGui.QColor(UI_COLORS["text"]))
        widget.setExtraSelections([selection])

    def copy_output(self) -> None:
        text = self.output_box.toPlainText()
        QtWidgets.QApplication.clipboard().setText(text)
        self.status.showMessage("Output copied to clipboard.")

    def on_input_enter_pressed(self) -> None:
        if self.enter_copy_checkbox.isChecked():
            self.copy_output()
            return
        cursor = self.input_box.textCursor()
        cursor.insertBlock()
        self.input_box.setTextCursor(cursor)

    def on_always_on_top_toggled(self, checked: bool) -> None:
        self.apply_always_on_top(checked)
        self.save_config()

    def apply_always_on_top(self, checked: bool) -> None:
        if sys.platform.startswith("win"):
            try:
                import ctypes
                from ctypes import wintypes

                hwnd_topmost = -1
                hwnd_notopmost = -2
                swp_nosize = 0x0001
                swp_nomove = 0x0002
                swp_noactivate = 0x0010
                swp_showwindow = 0x0040
                set_window_pos = ctypes.windll.user32.SetWindowPos
                set_window_pos.argtypes = [
                    wintypes.HWND,
                    wintypes.HWND,
                    ctypes.c_int,
                    ctypes.c_int,
                    ctypes.c_int,
                    ctypes.c_int,
                    ctypes.c_uint,
                ]
                set_window_pos.restype = wintypes.BOOL
                flags = swp_nomove | swp_nosize | swp_showwindow
                if not checked:
                    flags |= swp_noactivate
                ok = set_window_pos(
                    int(self.winId()),
                    hwnd_topmost if checked else hwnd_notopmost,
                    0,
                    0,
                    0,
                    0,
                    flags,
                )
                if not ok:
                    raise ctypes.WinError(ctypes.get_last_error())
                if checked:
                    self.raise_()
                    self.activateWindow()
                return
            except Exception:
                pass
        self.setWindowFlag(QtCore.Qt.WindowType.WindowStaysOnTopHint, checked)
        self.show()
        if checked:
            self.raise_()
            self.activateWindow()

    def closeEvent(self, event: QtGui.QCloseEvent) -> None:
        self.save_config()
        super().closeEvent(event)


def main() -> int:
    app = QtWidgets.QApplication(sys.argv)
    if APP_ICON.exists():
        app.setWindowIcon(QtGui.QIcon(str(APP_ICON)))
    apply_application_theme(app)
    window = RazorbeamFilterEvadeWindow()
    window.show()
    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())


