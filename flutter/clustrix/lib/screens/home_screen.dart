import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../constants/colors.dart';
import '../constants/fonts.dart';
import '../providers/app_provider.dart';
import '../widgets/sidebar.dart';
import '../widgets/chat_screen.dart';

/// EXACT MATCH RN App.js horizontal pager
/// Using ValueNotifier for zero setState during drag
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> with TickerProviderStateMixin {
  // Dimensions
  double _screenWidth = 0;
  double _sidebarWidth = 0;
  double _stretchDistance = 0;
  
  // ValueNotifiers for zero setState during gesture
  final ValueNotifier<double> _scrollX = ValueNotifier(1.0); // 0=sidebar, 1=main
  final ValueNotifier<double> _stretch = ValueNotifier(0.0);
  
  // State
  int _currentPage = 1;
  bool _sidebarOpen = false;
  bool _sidebarHasQuery = false;
  double _gestureStartStretch = 0;
  
  // Animation
  late AnimationController _snapController;
  late AnimationController _rightBtnController;

  @override
  void initState() {
    super.initState();
    _snapController = AnimationController(duration: const Duration(milliseconds: 200), vsync: this);
    _rightBtnController = AnimationController(duration: const Duration(milliseconds: 100), vsync: this);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _screenWidth = MediaQuery.of(context).size.width;
    _sidebarWidth = _screenWidth * 0.80;
    _stretchDistance = _screenWidth - _sidebarWidth;
  }

  @override
  void dispose() {
    _scrollX.dispose();
    _stretch.dispose();
    _snapController.dispose();
    _rightBtnController.dispose();
    super.dispose();
  }

  void _openSidebar() {
    FocusScope.of(context).unfocus();
    _currentPage = 0;
    _sidebarOpen = true;
    _animateTo(0, _sidebarHasQuery ? 1.0 : 0);
  }

  void _closeSidebar() {
    FocusScope.of(context).unfocus();
    _currentPage = 1;
    _sidebarOpen = false;
    _sidebarHasQuery = false;
    _animateTo(1.0, 0);
  }

  void _animateTo(double scrollTarget, double stretchTarget) {
    final startScroll = _scrollX.value;
    final startStretch = _stretch.value;
    
    _snapController.reset();
    _snapController.addListener(() {
      final t = Curves.easeOutCubic.transform(_snapController.value);
      _scrollX.value = startScroll + (scrollTarget - startScroll) * t;
      _stretch.value = startStretch + (stretchTarget - startStretch) * t;
    });
    _snapController.forward();
  }

  void _onDragStart(DragStartDetails d) {
    _snapController.stop();
    _gestureStartStretch = _stretch.value;
  }

  void _onDragUpdate(DragUpdateDetails d) {
    final delta = d.delta.dx / _sidebarWidth;
    
    // RN logic: if started expanded, handle stretch first
    if (_currentPage == 0 && _gestureStartStretch > 0) {
      if (d.delta.dx < 0) {
        // Swipe left - collapse stretch
        final newStretch = _stretch.value + d.delta.dx / _stretchDistance;
        if (newStretch < 0) {
          _stretch.value = 0;
          _scrollX.value = (_scrollX.value - delta).clamp(0.0, 1.0);
        } else {
          _stretch.value = newStretch.clamp(0.0, 1.0);
        }
      } else {
        // Swipe right - expand more
        _stretch.value = (_stretch.value + d.delta.dx / _stretchDistance).clamp(0.0, 1.0);
      }
      return;
    }
    
    // Normal pager movement
    final newVal = _scrollX.value - delta;
    if (newVal < 0) {
      _scrollX.value = 0;
      _stretch.value = (-newVal * _sidebarWidth / _stretchDistance).clamp(0.0, 1.0);
    } else {
      _scrollX.value = newVal.clamp(0.0, 1.0);
      _stretch.value = 0;
    }
  }

  void _onDragEnd(DragEndDetails d) {
    final vel = d.velocity.pixelsPerSecond.dx;
    int targetPage;
    if (vel.abs() > 500) {
      targetPage = vel > 0 ? 0 : 1;
    } else {
      targetPage = _scrollX.value < 0.5 ? 0 : 1;
    }
    
    _currentPage = targetPage;
    _sidebarOpen = targetPage == 0;
    _animateTo(targetPage == 0 ? 0.0 : 1.0, 0);
    
    if (targetPage == 1) {
      FocusScope.of(context).unfocus();
      _sidebarHasQuery = false;
    }
  }

  void _onSearchChange(bool hasQuery) {
    if (!_sidebarOpen) return;
    _sidebarHasQuery = hasQuery;
    _animateTo(_scrollX.value, hasQuery ? 1.0 : 0);
  }

  @override
  Widget build(BuildContext context) {
    final topInset = MediaQuery.of(context).padding.top;
    final totalWidth = _sidebarWidth + _screenWidth;
    
    return Consumer<AppProvider>(
      builder: (context, appProvider, _) {
        final showRightBtns = appProvider.currentSession != null && appProvider.messages.isNotEmpty;
        showRightBtns ? _rightBtnController.forward() : _rightBtnController.reverse();

        return AnnotatedRegion<SystemUiOverlayStyle>(
          value: SystemUiOverlayStyle.light,
          child: Scaffold(
            backgroundColor: AppColors.bg,
            resizeToAvoidBottomInset: false,
            body: GestureDetector(
              onHorizontalDragStart: _onDragStart,
              onHorizontalDragUpdate: _onDragUpdate,
              onHorizontalDragEnd: _onDragEnd,
              behavior: HitTestBehavior.translucent,
              child: ValueListenableBuilder<double>(
                valueListenable: _scrollX,
                builder: (context, scrollVal, _) {
                  return ValueListenableBuilder<double>(
                    valueListenable: _stretch,
                    builder: (context, stretchVal, _) {
                      final scrollPx = scrollVal * _sidebarWidth;
                      final stretchPx = stretchVal * _stretchDistance;
                      final overlayOpacity = (1 - scrollVal) * 0.5;
                      
                      return Stack(
                        children: [
                          // Pager
                          Positioned(
                            left: -scrollPx,
                            top: 0,
                            bottom: 0,
                            width: totalWidth + stretchPx,
                            child: Row(
                              children: [
                                // Sidebar
                                Container(
                                  width: _sidebarWidth + stretchPx,
                                  padding: EdgeInsets.only(top: topInset),
                                  color: AppColors.bg,
                                  child: Sidebar(
                                    onClose: _closeSidebar,
                                    onSearchQueryChange: _onSearchChange,
                                    isExpanded: _sidebarHasQuery,
                                  ),
                                ),
                                // Main
                                SizedBox(
                                  width: _screenWidth,
                                  child: Stack(
                                    children: [
                                      const ChatScreenWidget(),
                                      // Gradient
                                      Positioned(
                                        top: 0, left: 0, right: 0,
                                        child: IgnorePointer(
                                          child: Container(
                                            height: topInset + 80,
                                            decoration: const BoxDecoration(
                                              gradient: LinearGradient(
                                                begin: Alignment.topCenter,
                                                end: Alignment.bottomCenter,
                                                colors: [AppColors.bg90, AppColors.bg90, AppColors.bg70, Colors.transparent],
                                                stops: [0, 0.5, 0.7, 1],
                                              ),
                                            ),
                                          ),
                                        ),
                                      ),
                                      // Buttons
                                      Positioned(
                                        top: topInset + 11, left: 16,
                                        child: _Btn(w: 45, h: 45, onTap: _openSidebar, child: const Icon(Icons.menu, size: 22, color: AppColors.icon)),
                                      ),
                                      Positioned(
                                        top: topInset + 11, left: 69,
                                        child: _Btn(w: 105, h: 45, onTap: () {}, child: const Text('Clustrix', style: TextStyle(fontFamily: AppFonts.display, fontSize: 16, fontWeight: FontWeight.bold, color: AppColors.icon))),
                                      ),
                                      if (showRightBtns)
                                        Positioned(
                                          top: topInset + 11, right: 16,
                                          child: FadeTransition(
                                            opacity: _rightBtnController,
                                            child: _RightBtns(
                                              onNew: () { appProvider.clearCurrentSession(); if (_sidebarOpen) _closeSidebar(); },
                                              onMore: () => _showMenu(context),
                                            ),
                                          ),
                                        ),
                                      // Overlay
                                      if (overlayOpacity > 0.01)
                                        Positioned.fill(
                                          child: GestureDetector(
                                            onTap: _closeSidebar,
                                            child: Container(color: Colors.white.withOpacity(overlayOpacity * 0.6)),
                                          ),
                                        ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      );
                    },
                  );
                },
              ),
            ),
          ),
        );
      },
    );
  }

  void _showMenu(BuildContext ctx) {
    final s = ctx.read<AppProvider>().currentSession;
    if (s == null) return;
    showModalBottomSheet(
      context: ctx,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (c) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          ListTile(leading: const Icon(LucideIcons.pencil, color: AppColors.fg, size: 18), title: const Text('Rename', style: TextStyle(color: AppColors.fg)), onTap: () { Navigator.pop(c); _rename(ctx, s); }),
          ListTile(leading: const Icon(LucideIcons.trash2, color: AppColors.danger, size: 18), title: const Text('Delete', style: TextStyle(color: AppColors.danger)), onTap: () { Navigator.pop(c); _delete(ctx, s); }),
        ]),
      ),
    );
  }

  void _rename(BuildContext ctx, dynamic s) {
    final c = TextEditingController(text: s.name);
    showDialog(context: ctx, builder: (x) => AlertDialog(
      backgroundColor: AppColors.surface,
      title: const Text('Rename', style: TextStyle(color: AppColors.fg)),
      content: TextField(controller: c, autofocus: true, style: const TextStyle(color: AppColors.fg)),
      actions: [
        TextButton(onPressed: () => Navigator.pop(x), child: const Text('Cancel')),
        TextButton(onPressed: () { ctx.read<AppProvider>().renameSession(s.id, c.text); Navigator.pop(x); }, child: const Text('Save')),
      ],
    ));
  }

  void _delete(BuildContext ctx, dynamic s) {
    showDialog(context: ctx, builder: (x) => AlertDialog(
      backgroundColor: AppColors.surface,
      title: const Text('Delete?', style: TextStyle(color: AppColors.fg)),
      actions: [
        TextButton(onPressed: () => Navigator.pop(x), child: const Text('Cancel')),
        TextButton(onPressed: () { ctx.read<AppProvider>().deleteSession(s.id); Navigator.pop(x); }, child: const Text('Delete', style: TextStyle(color: AppColors.danger))),
      ],
    ));
  }
}

class _Btn extends StatelessWidget {
  final double w, h;
  final VoidCallback onTap;
  final Widget child;
  const _Btn({required this.w, required this.h, required this.onTap, required this.child});
  
  @override
  Widget build(BuildContext context) => Material(
    color: AppColors.inputBg,
    borderRadius: BorderRadius.circular(50),
    child: InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(50),
      child: Container(
        width: w, height: h,
        decoration: BoxDecoration(borderRadius: BorderRadius.circular(50), border: Border.all(color: AppColors.borderLight)),
        alignment: Alignment.center,
        child: child,
      ),
    ),
  );
}

class _RightBtns extends StatelessWidget {
  final VoidCallback onNew, onMore;
  const _RightBtns({required this.onNew, required this.onMore});
  
  @override
  Widget build(BuildContext context) => Container(
    width: 88, height: 45,
    decoration: BoxDecoration(color: AppColors.inputBg, borderRadius: BorderRadius.circular(50), border: Border.all(color: AppColors.borderLight)),
    child: Row(mainAxisAlignment: MainAxisAlignment.spaceEvenly, children: [
      Material(color: Colors.transparent, child: InkWell(onTap: onNew, borderRadius: BorderRadius.circular(30), child: const SizedBox(width: 43, height: 43, child: Center(child: Icon(Icons.edit_outlined, size: 23, color: AppColors.icon))))),
      Material(color: Colors.transparent, child: InkWell(onTap: onMore, borderRadius: BorderRadius.circular(30), child: const SizedBox(width: 43, height: 43, child: Center(child: Icon(Icons.more_vert, size: 21, color: AppColors.icon))))),
    ]),
  );
}
