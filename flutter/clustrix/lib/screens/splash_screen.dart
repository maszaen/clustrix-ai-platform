import 'package:flutter/material.dart';
import '../constants/colors.dart';
import '../constants/fonts.dart';
import '../widgets/diamond_logo.dart';

/// Splash screen with Diamond Logo - EXACT MATCH RN WelcomeOverlay
class SplashScreen extends StatefulWidget {
  final String? message;
  
  const SplashScreen({super.key, this.message});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _fadeAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 800),
      vsync: this,
    );

    _fadeAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _controller,
        curve: Curves.easeIn,
      ),
    );

    _controller.forward();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // loadingOverlayStyles.overlay: position absolute, bg, center, zIndex 9999
    return Scaffold(
      backgroundColor: AppColors.bg,
      body: Center(
        child: FadeTransition(
          opacity: _fadeAnimation,
          // welcomeContainer: alignItems center, gap 0, paddingBottom 45
          child: Padding(
            padding: const EdgeInsets.only(bottom: 45),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // logoContainer: width 150, height 120
                const SizedBox(
                  width: 150,
                  height: 120,
                  child: DiamondLogo(isLoader: true),
                ),
                if (widget.message != null && widget.message!.isNotEmpty)
                  // welcomeText: fontSize 24, maxWidth 80%, textAlign center, paddingHorizontal 20
                  ConstrainedBox(
                    constraints: BoxConstraints(
                      maxWidth: MediaQuery.of(context).size.width * 0.8,
                    ),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                      child: Text(
                        widget.message!,
                        style: const TextStyle(
                          fontFamily: AppFonts.display,
                          fontSize: 24,
                          color: AppColors.fg,
                        ),
                        textAlign: TextAlign.center,
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
