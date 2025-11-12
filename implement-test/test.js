const { autoheal } = require('./autoheal');

const testCases = [
  {
    input: '<try><try-title>The title</try-title><li>Content 1</li><li>Content 2</li></try>',
    expected: '<try><try-title>The title</try-title><li>Content 1</li><li>Content 2</li></try>',
    description: 'Correct structure'
  },
  {
    input: '<try><try-title>Lebih Lanjut tentang Struktur Kalimat</try-title><li>Berikan contoh kalimat kompleks dalam konteks akademis</li<li>Jelaskan cara mengubah kalimat simple menjadi kompleks</li><li>Bandingkan kalimat kompleks dengan kalimat majemuk</li></try>',
    expected: '<try><try-title>Lebih Lanjut tentang Struktur Kalimat</try-title><li>Berikan contoh kalimat kompleks dalam konteks akademis</li><li>Jelaskan cara mengubah kalimat simple menjadi kompleks</li><li>Bandingkan kalimat kompleks dengan kalimat majemuk</li></try>',
    description: 'Unclosed li (missing </li>)'
  },
  {
    input: '<try><try-title>Lebih Lanjut tentang Struktur Kalimat</try-title><li>Berikan contoh kalimat kompleks dalam konteks akademis</li></li><li>Jelaskan cara mengubah kalimat simple menjadi kompleks</li><li>Bandingkan kalimat kompleks dengan kalimat majemuk</li></try>',
    expected: '<try><try-title>Lebih Lanjut tentang Struktur Kalimat</try-title><li>Berikan contoh kalimat kompleks dalam konteks akademis</li><li>Jelaskan cara mengubah kalimat simple menjadi kompleks</li><li>Bandingkan kalimat kompleks dengan kalimat majemuk</li></try>',
    description: 'Duplicate </li>'
  },
  {
    input: '<try><try-title>Lebih Lanjut tentang Struktur Kalimat</try-title><li>Berikan contoh kalimat kompleks dalam konteks akademis<li>Jelaskan cara mengubah kalimat simple menjadi kompleks<li>Bandingkan kalimat kompleks dengan kalimat majemuk</li></try>',
    expected: '<try><try-title>Lebih Lanjut tentang Struktur Kalimat</try-title><li>Berikan contoh kalimat kompleks dalam konteks akademis</li><li>Jelaskan cara mengubah kalimat simple menjadi kompleks</li><li>Bandingkan kalimat kompleks dengan kalimat majemuk</li></try>',
    description: 'Missing closing </li> for multiple'
  },
  {
    input: '<try><try-title>Lebih Lanjut tentang Struktur Kalimat<li>Berikan contoh kalimat kompleks dalam konteks akademis</li><li>Jelaskan cara mengubah kalimat simple menjadi kompleks</li><li>Bandingkan kalimat kompleks dengan kalimat majemuk</li></try>',
    expected: '<try><try-title>Lebih Lanjut tentang Struktur Kalimat</try-title><li>Berikan contoh kalimat kompleks dalam konteks akademis</li><li>Jelaskan cara mengubah kalimat simple menjadi kompleks</li><li>Bandingkan kalimat kompleks dengan kalimat majemuk</li></try>',
    description: 'Unclosed try-title'
  },
  {
    input: '<try-title>The title</try-title><li>Content 1</li><li>Content 2</li></try>',
    expected: '<try><try-title>The title</try-title><li>Content 1</li><li>Content 2</li></try>',
    description: 'Missing opening <try>'
  },
  {
    input: '<try><try-title>The title</try-title><li>Content 1</li><li>Content 2</li>',
    expected: '<try><try-title>The title</try-title><li>Content 1</li><li>Content 2</li></try>',
    description: 'Missing closing </try>'
  },
  {
    input: '<try><try-title>The title</try-title><li>Content 1<li>Content 2<li>Content 3</li></try>',
    expected: '<try><try-title>The title</try-title><li>Content 1</li><li>Content 2</li><li>Content 3</li></try>',
    description: 'Multiple unclosed li'
  },
  {
    input: '<try><try-title>The title</try-title><li>Content 1</li><li>Content 2</li></try></try>',
    expected: '<try><try-title>The title</try-title><li>Content 1</li><li>Content 2</li></try>',
    description: 'Extra closing </try>'
  },
  {
    input: '<try<try-title>Lebih Lanjut tentang Struktur Kalimat</try-title><li>Berikan contoh kalimat kompleks dalam konteks akademis</li></li><li>Jelaskan cara mengubah kalimat simple menjadi kompleks<li>Bandingkan kalimat kompleks dengan kalimat majemuk</li></try>',
    expected: '<try><try-title>Lebih Lanjut tentang Struktur Kalimat</try-title><li>Berikan contoh kalimat kompleks dalam konteks akademis</li><li>Jelaskan cara mengubah kalimat simple menjadi kompleks</li><li>Bandingkan kalimat kompleks dengan kalimat majemuk</li></try>',
    description: 'Mixed errors: malformed <try, duplicate </li>, unclosed li'
  },
  // 30 Test Cases Tambahan
  {
    input: '<try><try-title></try-title><li>Empty title test</li></try>',
    expected: '<try><try-title></try-title><li>Empty title test</li></try>',
    description: 'Empty try-title content'
  },
  {
    input: '<try><try-title>Title</try-title></try>',
    expected: '<try><try-title>Title</try-title></try>',
    description: 'No li items, only title'
  },
  {
    input: '<try><li>No title here</li><li>Just items</li></try>',
    expected: '<try><li>No title here</li><li>Just items</li></try>',
    description: 'Missing try-title completely'
  },
  {
    input: '<try><try-title>Title<li>Item mixed in title</li></try>',
    expected: '<try><try-title>Title</try-title><li>Item mixed in title</li></try>',
    description: 'Li tag inside unclosed try-title'
  },
  {
    input: '   <try><try-title>Spaced</try-title><li>Item</li></try>   ',
    expected: '<try><try-title>Spaced</try-title><li>Item</li></try>',
    description: 'Leading and trailing whitespace'
  },
  {
    input: '<try><try-title>Multiple</try-title></try-title><li>Extra closing title</li></try>',
    expected: '<try><try-title>Multiple</try-title><li>Extra closing title</li></try>',
    description: 'Duplicate closing try-title'
  },
  {
    input: '<try><try-title><try-title>Nested title</try-title></try-title><li>Item</li></try>',
    expected: '<try><try-title><try-title>Nested title</try-title><li>Item</li></try>',
    description: 'Nested try-title tags'
  },
  {
    input: '<try><try-title>Title</try-title><li></li><li>Content</li></try>',
    expected: '<try><try-title>Title</try-title><li></li><li>Content</li></try>',
    description: 'Empty li tag'
  },
  {
    input: '<try><try-title>T</try-title><li>A</li><li>B</li><li>C</li><li>D</li><li>E</li></try>',
    expected: '<try><try-title>T</try-title><li>A</li><li>B</li><li>C</li><li>D</li><li>E</li></try>',
    description: 'Many li items (5+)'
  },
  {
    input: '<try><try-title>Special chars: <>&"\'</try-title><li>Test</li></try>',
    expected: '<try><try-title>Special chars: <>&"\'</try-title><li>Test</li></try>',
    description: 'Special characters in title'
  },
  {
    input: '<try><try-title>Title</try-title><li>Item with <>&"\' chars</li></try>',
    expected: '<try><try-title>Title</try-title><li>Item with <>&"\' chars</li></try>',
    description: 'Special characters in li content'
  },
  {
    input: '<TRY><TRY-TITLE>Uppercase</TRY-TITLE><LI>Item</LI></TRY>',
    expected: '<try><try-title>Uppercase</try-title><li>Item</li></try>',
    description: 'Uppercase tags'
  },
  {
    input: '<try><try-title>Title</try-title><li>Item 1</li><li>Item 1</li></try>',
    expected: '<try><try-title>Title</try-title><li>Item 1</li></try>',
    description: 'Duplicate li content (should dedupe)'
  },
  {
    input: '<try><try-title>Very long title that goes on and on and on with lots of text to test the handling of lengthy content inside the title tag</try-title><li>Item</li></try>',
    expected: '<try><try-title>Very long title that goes on and on and on with lots of text to test the handling of lengthy content inside the title tag</try-title><li>Item</li></try>',
    description: 'Very long title content'
  },
  {
    input: '<try><try-title>Title</try-title><li>Very long item content that continues for a while with multiple sentences and lots of detail to ensure the autoheal function can handle lengthy li content properly tanpa breaking</li></try>',
    expected: '<try><try-title>Title</try-title><li>Very long item content that continues for a while with multiple sentences and lots of detail to ensure the autoheal function can handle lengthy li content properly tanpa breaking</li></try>',
    description: 'Very long li content'
  },
  {
    input: '<try><try-title>Title</try-title><li>Line\nbreak\ntest</li></try>',
    expected: '<try><try-title>Title</try-title><li>Line\nbreak\ntest</li></try>',
    description: 'Newlines in li content'
  },
  {
    input: '<try><try-title>Title\nwith\nbreaks</try-title><li>Item</li></try>',
    expected: '<try><try-title>Title\nwith\nbreaks</try-title><li>Item</li></try>',
    description: 'Newlines in title'
  },
  {
    input: '<try><try-title>Title</try-title><li>Item 1<li>Item 2</li></li></try>',
    expected: '<try><try-title>Title</try-title><li>Item 1</li><li>Item 2</li></try>',
    description: 'Mixed unclosed and extra closing li'
  },
  {
    input: '<try><try-title>Title</try-title><li><li>Double open</li></try>',
    expected: '<try><try-title>Title</try-title><li></li><li>Double open</li></try>',
    description: 'Double opening li tag'
  },
  {
    input: '<try><try-title>Title</try-title><li>Item</li></li></li></try>',
    expected: '<try><try-title>Title</try-title><li>Item</li></try>',
    description: 'Triple closing li tag'
  },
  {
    input: '<try<try-title>Malformed opening try<li>Item</li></try>',
    expected: '<try><try-title>Malformed opening try</try-title><li>Item</li></try>',
    description: 'Malformed <try (missing >)'
  },
  {
    input: '<try><try-title>Title</try-title<li>Malformed closing title<li>Item</li></try>',
    expected: '<try><try-title>Title</try-title><li>Malformed closing title</li><li>Item</li></try>',
    description: 'Malformed </try-title> (missing >)'
  },
  {
    input: '<try><try-title>Title</try-title><li>Item 1</li><notli>Not an li</notli><li>Item 2</li></try>',
    expected: '<try><try-title>Title</try-title><li>Item 1</li><li>Item 2</li></try>',
    description: 'Invalid tag between li tags'
  },
  {
    input: '<try><try-title>Title</try-title><li>Item<nested>tag</nested>here</li></try>',
    expected: '<try><try-title>Title</try-title><li>Item<nested>tag</nested>here</li></try>',
    description: 'Nested unknown tags in li'
  },
  {
    input: '<<try>><try-title>Double brackets</try-title><li>Item</li></try>>',
    expected: '<try><try-title>Double brackets</try-title><li>Item</li></try>',
    description: 'Extra angle brackets around try'
  },
  {
    input: '<try><try-title>Title</try-title><li>Item 1<li>Item 2<li>Item 3<li>Item 4<li>Item 5</try>',
    expected: '<try><try-title>Title</try-title><li>Item 1</li><li>Item 2</li><li>Item 3</li><li>Item 4</li><li>Item 5</li></try>',
    description: 'All li tags unclosed'
  },
  {
    input: '<try><try-title>Unicode тест 测试 テスト</try-title><li>Unicode content</li></try>',
    expected: '<try><try-title>Unicode тест 测试 テスト</try-title><li>Unicode content</li></try>',
    description: 'Unicode characters in title'
  },
  {
    input: '<try><try-title>Title</try-title><li>Emoji test 🔥 💻 🚀</li></try>',
    expected: '<try><try-title>Title</try-title><li>Emoji test 🔥 💻 🚀</li></try>',
    description: 'Emoji in li content'
  },
  {
    input: '',
    expected: '<try></try>',
    description: 'Empty string input'
  },
  {
    input: 'Plain text without any tags',
    expected: '<try><li>Plain text without any tags</li></try>',
    description: 'Plain text without tags'
  }
];

console.log('Running autoheal tests...\n');

let failedState = 0;
let passedState = 0;

testCases.forEach((test, index) => {
  console.log(`Test ${index + 1}: ${test.description}`);
  console.log('Input:', test.input);

  const output = autoheal(test.input);
  console.log('Output:', output);
  console.log('Expected:', test.expected);

  const passed = output === test.expected;
  console.log('Passed:', passed ? '🟢 YES' : '🔴 NO');

  if (!passed) {
    failedState++;
    console.log('Difference: Expected length', test.expected.length, 'Got length', output.length);
  } else {
    passedState++;
  }

  console.log('---\n');
});

// ✅ Fix bagian ini:
if (testCases.length > 0) {
  console.log(`Summary: ${passedState} passed / ${failedState} failed`);
} else {
  console.log("No test cases found.");
}
