import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../constants/colors.dart';
import '../constants/fonts.dart';
import '../providers/app_provider.dart';
import '../models/message.dart';
import 'chat_input.dart';
import 'diamond_logo.dart';

/// Welcome view - EXACT MATCH RN ChatScreen ketika !currentSession && messages.length === 0
class WelcomeView extends StatefulWidget {
  const WelcomeView({super.key});

  @override
  State<WelcomeView> createState() => _WelcomeViewState();
}

class _WelcomeViewState extends State<WelcomeView> {
  final TextEditingController _inputController = TextEditingController();
  String _displayText = '';

  @override
  void initState() {
    super.initState();
    Future.delayed(const Duration(milliseconds: 100), _startTypewriter);
  }

  void _startTypewriter() async {
    if (!mounted) return;
    
    final appProvider = context.read<AppProvider>();
    final message = appProvider.welcomeMessage;
    
    for (int i = 0; i < message.length; i++) {
      if (!mounted) return;
      
      final char = message[i];
      final delay = RegExp(r'[.,?!;:\-–]').hasMatch(char) 
          ? 350 
          : 30 + (DateTime.now().millisecondsSinceEpoch % 40);
      
      await Future.delayed(Duration(milliseconds: delay));
      
      if (!mounted) return;
      setState(() {
        _displayText = message.substring(0, i + 1);
      });
    }
  }

  @override
  void dispose() {
    _inputController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final topInset = MediaQuery.of(context).padding.top;
    
    // RN Layout:
    // container > emptyState (flex 1, center) + inputContainer (absolute bottom 0)
    return Stack(
      children: [
        // emptyState: flex: 1, justifyContent: 'center', alignItems: 'center'
        Positioned.fill(
          child: GestureDetector(
            onTap: () => FocusScope.of(context).unfocus(),
            child: Container(
              color: AppColors.bg,
              padding: EdgeInsets.only(top: topInset),
              child: Center(
                // welcomeContainer: alignItems: 'center', paddingBottom: 45
                child: Padding(
                  padding: const EdgeInsets.only(bottom: 45),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      // logoContainer: width: 150, height: 120
                      const SizedBox(
                        width: 150,
                        height: 120,
                        child: DiamondLogo(isLoader: false),
                      ),
                      // welcomeText: fontSize: 24, maxWidth: '80%', textAlign: 'center', paddingHorizontal: 20
                      ConstrainedBox(
                        constraints: BoxConstraints(
                          maxWidth: MediaQuery.of(context).size.width * 0.8,
                        ),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 20),
                          child: Text(
                            _displayText,
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
          ),
        ),
        
        // inputContainer: position: 'absolute', bottom: 0, left: 0, right: 0
        Positioned(
          bottom: 0,
          left: 0,
          right: 0,
          child: ChatInput(
            controller: _inputController,
            placeholder: 'How can I help you today?',
            onSend: _handleSend,
            onOpenAttachmentModal: () {
              // TODO: Open attachment modal
            },
          ),
        ),
      ],
    );
  }

  void _handleSend() async {
    final text = _inputController.text.trim();
    if (text.isEmpty) return;
    
    final appProvider = context.read<AppProvider>();
    
    final session = await appProvider.createSession('New Chat');
    
    _inputController.clear();
    
    final userMessage = Message(
      role: 'user',
      content: text,
      messageIndex: 0,
      createdAt: DateTime.now().millisecondsSinceEpoch,
    );
    
    await appProvider.appendMessage(userMessage, targetSession: session);
  }
}
