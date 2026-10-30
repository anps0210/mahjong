const {test}=require('node:test');
const assert=require('node:assert/strict');
const {chooseDiscard,shanten,countsOf}=require('../bot');
test('recognizes completed standard, seven-pairs and orphan hands',()=>{
 for(const hand of [
 ['1만','2만','3만','4만','5만','6만','2통','3통','4통','5삭','6삭','7삭','동','동'],
 ['1만','1만','3만','3만','5만','5만','2통','2통','7통','7통','동','동','백','백'],
 ['1만','9만','1통','9통','1삭','9삭','동','남','서','북','백','발','중','중']
 ]) assert.equal(shanten(countsOf(hand)),-1);
});
test('keeps completed groups and pairs while discarding isolated honor',()=>{
 const hand=['1만','2만','3만','4만','5만','6만','2통','3통','4통','5삭','6삭','동','동','백'];
 const before=hand.slice();
 assert.equal(chooseDiscard(hand),'백');
 assert.deepEqual(hand,before);
});
