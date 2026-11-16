package com.fct.gardendless

import android.content.Context
import android.util.AttributeSet
import android.view.InputDevice
import android.view.MotionEvent
import android.webkit.WebView
import kotlin.math.hypot

/** Canvas touches use one ordered JS mouse stream; HTML controls retain native touches. */
class MouseGameWebView @JvmOverloads constructor(
    context: Context, attrs: AttributeSet? = null
) : WebView(context, attrs) {
    private var dragging = false
    private var twoFinger = false
    private var multiMoved = false
    private var startX = 0f
    private var startY = 0f
    private var lastY = 0f
    private var lastX = 0f
    private var lastTouchY = 0f
    private val threshold = 8f * resources.displayMetrics.density

    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
        if (event.isFromSource(InputDevice.SOURCE_MOUSE) || event.isFromSource(InputDevice.SOURCE_STYLUS)) {
            return super.dispatchTouchEvent(event)
        }
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                dragging = true
                twoFinger = false
                multiMoved = false
                lastX = event.x
                lastTouchY = event.y
                emit("down", event.x, event.y)
            }
            MotionEvent.ACTION_POINTER_DOWN -> {
                if (dragging) emit("up", lastX, lastTouchY)
                dragging = false
                if (!twoFinger && event.pointerCount == 2) {
                    twoFinger = true
                    startX = (event.getX(0) + event.getX(1)) / 2
                    startY = (event.getY(0) + event.getY(1)) / 2
                    lastY = startY
                } else multiMoved = true
            }
            MotionEvent.ACTION_MOVE -> {
                if (twoFinger && event.pointerCount == 2) {
                    val cx = (event.getX(0) + event.getX(1)) / 2
                    val cy = (event.getY(0) + event.getY(1)) / 2
                    if (hypot((cx - startX).toDouble(), (cy - startY).toDouble()) > threshold) multiMoved = true
                    if (multiMoved) {
                        emit("wheel", startX, startY, delta = (lastY - cy) * 6f)
                        lastY = cy
                    }
                } else if (dragging) {
                    lastX = event.x
                    lastTouchY = event.y
                    emit("move", event.x, event.y)
                }
            }
            MotionEvent.ACTION_UP -> {
                if (dragging) emit("up", event.x, event.y)
                else if (twoFinger && !multiMoved) emit("right", startX, startY)
                dragging = false
                twoFinger = false
            }
            MotionEvent.ACTION_CANCEL -> {
                if (dragging) emit("cancel", lastX, lastTouchY)
                dragging = false
                twoFinger = false
                multiMoved = true
            }
        }
        // Canvas native touches are blocked by the packaged capture listener. Native
        // events must still reach HTML overlays, dialogs and file picker controls.
        super.dispatchTouchEvent(event)
        return true
    }

    private fun emit(kind: String, x: Float, y: Float, delta: Float = 0f) {
        if (width <= 0 || height <= 0 || !x.isFinite() || !y.isFinite() || !delta.isFinite()) return
        evaluateJavascript(CanvasMouseScript.call(kind, x / width, y / height, dragging, delta), null)
    }
}
