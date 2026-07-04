# Sharp Movement Detector

Autonomous agent for the TxODDS "Trading Tools and Agents" hackathon (World Cup track).

Streams live TxLINE odds via SSE, flags statistically significant line moves in
real time, logs every signal to SQLite, and — once each fixture finishes —
checks whether the move correctly anticipated the result. No manual input
required once running.
