package com.delcargo.internal;

import com.getcapacitor.BridgeActivity;

/**
 * Main entry point for the DelCargo HR Android application.
 *
 * This activity extends {@link BridgeActivity} from the Capacitor framework,
 * which serves as the bridge between the native Android environment and the
 * web application (Next.js/React) running in the WebView.
 *
 * Capacitor handles the initialization of the WebView and any registered
 * plugins (e.g., Background Geolocation, Haptics, Keyboard, OneSignal)
 * automatically based on the project configuration.
 */
public class MainActivity extends BridgeActivity {}
