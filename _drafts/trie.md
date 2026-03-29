---
title: "Trie"
subtitle: "Trie Data Structure"
layout: post
author: "DooDoo"
header-style: text
keywords: "algorithm, trie"
tags:
  - Algorithm
  - Tree


---

Trie
---
검색 트리의 일종으로, 문자열을 저장하고 탐색하는데 효율적인 자료구조  
Trie는 문자열의 접두사(Prefix)를 이용하여 트리를 구성하므로, 특히나 문자열 검색에 유용  

Trie의 구현
---
- 각 노드는 문자를 저장하는데 사용되는 노드
- 루트 노드부터 시작하여 문자열을 표현
- 각 노드는 해당 노드까지의 문자열(prefix)를 나타내며, 단어의 끝을 표시하는 플래그를 가질 수 있음
- 자식 노드는 해당 문자 다음에 나타날 수 있는 문자를 저장하는 데 사용됨


