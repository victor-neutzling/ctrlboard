import Gio from "gi://Gio";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Keyboard from "resource:///org/gnome/shell/ui/status/keyboard.js";

const BUS_NAME = "org.ctrlboard.Keyboard";
const OBJECT_PATH = "/org/ctrlboard/Keyboard";
const INTERFACE_XML = `
<node>
  <interface name="org.ctrlboard.Keyboard">
    <method name="GetCurrent">
      <arg name="index" type="u" direction="out" />
    </method>
    <method name="Activate">
      <arg name="index" type="u" direction="in" />
      <arg name="success" type="b" direction="out" />
    </method>
  </interface>
</node>`;

export default class CtrlboardKeyboardBridge extends Extension {
  enable() {
    this._dbus = Gio.DBusExportedObject.wrapJSObject(INTERFACE_XML, this);
    this._dbus.export(Gio.DBus.session, OBJECT_PATH);
    this._nameOwnerId = Gio.bus_own_name_on_connection(
      Gio.DBus.session,
      BUS_NAME,
      Gio.BusNameOwnerFlags.NONE,
      null,
      null,
    );
  }

  disable() {
    if (this._nameOwnerId) {
      Gio.bus_unown_name(this._nameOwnerId);
      this._nameOwnerId = 0;
    }
    this._dbus?.unexport();
    this._dbus = null;
  }

  GetCurrent() {
    return Keyboard.getInputSourceManager().currentSource?.index ?? 0;
  }

  Activate(index) {
    const source = Keyboard.getInputSourceManager().inputSources[index];
    if (!source) return false;
    Keyboard.getInputSourceManager().activateInputSource(source, true);
    return true;
  }
}
