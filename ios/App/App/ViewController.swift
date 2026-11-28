import UIKit
import Capacitor

/// The app's web view, minus iOS's scroll edge effect: since iOS 26 a scroll view blurs and fades
/// whatever is under the status bar and home indicator. The board is meant to run edge to edge and
/// never scrolls, so the effect only smudges the cells there.
///
/// SceneDelegate creates this in place of Capacitor's plain CAPBridgeViewController.
class ViewController: CAPBridgeViewController {
    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        // WebKit can set the effect up again as the page loads and lays out, so this runs after each layout.
        hideEdgeEffects()
    }

    private func hideEdgeEffects() {
        guard #available(iOS 26.0, *), let scrollView = webView?.scrollView else { return }
        for effect in [scrollView.topEdgeEffect, scrollView.bottomEdgeEffect, scrollView.leftEdgeEffect, scrollView.rightEdgeEffect] {
            if !effect.isHidden { effect.isHidden = true }
        }
    }
}
