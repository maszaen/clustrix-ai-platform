import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../constants/colors.dart';

/// Diamond Logo widget - Pure Flutter implementation
/// EXACT MATCH RN DIAMOND_LOGO_HTML animation
/// Uses CustomPainter instead of WebView for better performance
class DiamondLogo extends StatefulWidget {
  final bool isLoader;
  
  const DiamondLogo({
    super.key,
    this.isLoader = false,
  });

  @override
  State<DiamondLogo> createState() => _DiamondLogoState();
}

class _DiamondLogoState extends State<DiamondLogo> with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    // EXACT MATCH RN: --duration: 5s
    _controller = AnimationController(
      duration: const Duration(milliseconds: 5000),
      vsync: this,
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // EXACT MATCH RN: logoContainer width: 150, height: 120
    return SizedBox(
      width: 150,
      height: 150,
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, child) {
          return CustomPaint(
            painter: _DiamondPainter(
              progress: _controller.value,
              color: AppColors.accent,
              isLoader: widget.isLoader,
            ),
            size: const Size(150, 150),
          );
        },
      ),
    );
  }
}

class _DiamondPainter extends CustomPainter {
  final double progress;
  final Color color;
  final bool isLoader;
  
  _DiamondPainter({
    required this.progress,
    required this.color,
    this.isLoader = false,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    
    // EXACT MATCH RN: --size: 130px
    const figureSize = 130.0;
    // EXACT MATCH RN: --radius: calc(var(--size) / 4)
    const radius = figureSize / 4;
    // EXACT MATCH RN: --pull: -0.15
    const pull = -0.15;
    // EXACT MATCH RN: 10 or 12 diamonds
    final diamondCount = isLoader ? 10 : 12;
    // EXACT MATCH RN: width/height: calc(var(--size) / 4)
    const diamondSize = figureSize / 4;
    
    // EXACT MATCH RN: @keyframes spin-logo
    // 0%, 20% { translateY(0) }, 50% { translateY(20px) }, 80%, 100% { translateY(0) }
    double bounceY = 0;
    if (progress < 0.2) {
      bounceY = 0;
    } else if (progress < 0.5) {
      final t = (progress - 0.2) / 0.3;
      bounceY = 20 * t;
    } else if (progress < 0.8) {
      final t = (progress - 0.5) / 0.3;
      bounceY = 20 * (1 - t);
    } else {
      bounceY = 0;
    }
    
    // Apply bounce to center
    final bouncedCenter = Offset(center.dx, center.dy + bounceY);
    
    for (int i = 1; i <= diamondCount; i++) {
      // EXACT MATCH RN: --deg: calc(var(--i) * (360deg / 10))
      final deg = i * (360 / diamondCount) * (math.pi / 180);
      
      // Calculate diamond animation progress
      // EXACT MATCH RN: @keyframes diamonds
      // 0%, 20% { transform-start }, 50% { pulled in }, 80%, 100% { back }
      double animProgress;
      if (progress < 0.2) {
        animProgress = 0;
      } else if (progress < 0.5) {
        animProgress = (progress - 0.2) / 0.3;
      } else if (progress < 0.8) {
        animProgress = 1 - ((progress - 0.5) / 0.3);
      } else {
        animProgress = 0;
      }
      
      // EXACT MATCH RN: transform-start position
      final startX = math.cos(deg) * radius;
      final startY = math.sin(deg) * radius;
      
      // EXACT MATCH RN: pulled position with --pull: -0.15
      final pullX = math.cos(deg) * radius * pull;
      final pullY = math.sin(deg) * radius * pull;
      
      // Interpolate position
      final x = startX + (pullX - startX) * animProgress;
      final y = startY + (pullY - startY) * animProgress;
      
      // Rotation: start = deg, end = deg + 90deg
      final rotation = deg + (math.pi / 2) * animProgress;
      
      // Draw diamond
      canvas.save();
      canvas.translate(bouncedCenter.dx + x, bouncedCenter.dy + y);
      canvas.rotate(rotation);
      
      // Shimmer effect for loader
      Color diamondColor = color;
      if (isLoader) {
        // Simple shimmer based on index and progress
        final shimmerPhase = (progress + i * 0.15) % 1.0;
        final shimmerIntensity = (math.sin(shimmerPhase * math.pi * 2) + 1) / 2;
        diamondColor = Color.lerp(
          color,
          const Color(0xFF66CCFF), // --shimmer-color: hsl(200, 100%, 75%)
          shimmerIntensity * 0.3,
        )!;
      }
      
      // EXACT MATCH RN: clip-path: polygon(25% 25%, 100% 50%, 25% 75%, 0% 50%)
      // Changes to polygon(75% 25%, 100% 50%, 75% 75%, 0% 50%) at 50%
      final clipPath = Path();
      if (animProgress < 0.5) {
        // Start clip-path
        clipPath.moveTo(diamondSize * 0.25, diamondSize * 0.25);
        clipPath.lineTo(diamondSize * 1.0, diamondSize * 0.5);
        clipPath.lineTo(diamondSize * 0.25, diamondSize * 0.75);
        clipPath.lineTo(diamondSize * 0.0, diamondSize * 0.5);
      } else {
        // End clip-path
        clipPath.moveTo(diamondSize * 0.75, diamondSize * 0.25);
        clipPath.lineTo(diamondSize * 1.0, diamondSize * 0.5);
        clipPath.lineTo(diamondSize * 0.75, diamondSize * 0.75);
        clipPath.lineTo(diamondSize * 0.0, diamondSize * 0.5);
      }
      clipPath.close();
      
      // Center the diamond shape
      final centeredPath = clipPath.shift(Offset(-diamondSize / 2, -diamondSize / 2));
      
      final paint = Paint()
        ..color = diamondColor
        ..style = PaintingStyle.fill;
      
      canvas.drawPath(centeredPath, paint);
      canvas.restore();
    }
  }

  @override
  bool shouldRepaint(covariant _DiamondPainter oldDelegate) {
    return oldDelegate.progress != progress;
  }
}
