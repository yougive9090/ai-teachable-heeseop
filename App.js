import { useRef, useState, useEffect } from 'react';
import './App.css';

function App() {
  const canvasRef = useRef(null);
  const webcamRef = useRef(null);
  const modelRef = useRef(null);
  const ctxRef = useRef(null);
  const animationRef = useRef(null);

  const holdStartRef = useRef(null);
  const currentDirectionRef = useRef(null);
  const lastMoveTimeRef = useRef(0);

  const gameStateRef = useRef('start');
  const roomsRef = useRef({});
  const hasKeyRef = useRef(false);
  const playerPosRef = useRef({ x: 0, y: 0 });

  const [predictions, setPredictions] = useState([]);
  const [isCameraStarted, setIsCameraStarted] = useState(false);

  const [gameState, setGameState] = useState('start');
  const [playerPos, setPlayerPos] = useState({ x: 0, y: 0 });
  const [gold, setGold] = useState(0);
  const [heart, setHeart] = useState(3);
  const [hasKey, setHasKey] = useState(false);

  const [rooms, setRooms] = useState({});
  const [message, setMessage] = useState('GAME START를 눌러 시작하세요!');
  const [holdInfo, setHoldInfo] = useState({
    direction: 'None',
    percent: 0,
    time: 0,
  });

  const URL = "https://teachablemachine.withgoogle.com/models/qrCH6uM47/";

  // 맵은 5x5 유지
  const MAP_SIZE = 5;

  const MOVE_THRESHOLD = 0.8;
  const HOLD_TIME = 2000;
  const MOVE_COOLDOWN = 600;

  useEffect(() => {
    return () => {
      if (animationRef.current) {
        window.cancelAnimationFrame(animationRef.current);
      }

      if (webcamRef.current) {
        webcamRef.current.stop();
      }
    };
  }, []);

  const changeGameState = (state) => {
    gameStateRef.current = state;
    setGameState(state);
  };

  const updateRooms = (value) => {
    if (typeof value === 'function') {
      setRooms((prev) => {
        const next = value(prev);
        roomsRef.current = next;
        return next;
      });
    } else {
      roomsRef.current = value;
      setRooms(value);
    }
  };

  const updateHasKey = (value) => {
    hasKeyRef.current = value;
    setHasKey(value);
  };

  const updatePlayerPos = (pos) => {
    playerPosRef.current = pos;
    setPlayerPos(pos);
  };

  const initCamera = async () => {
    const tmPose = window.tmPose;

    if (!tmPose) {
      alert("Teachable Machine 라이브러리가 아직 로드되지 않았습니다.");
      return false;
    }

    if (isCameraStarted) return true;

    const modelURL = URL + "model.json";
    const metadataURL = URL + "metadata.json";

    const model = await tmPose.load(modelURL, metadataURL);
    modelRef.current = model;

    const maxPredictions = model.getTotalClasses();

    const size = 260;
    const flip = true;

    const webcam = new tmPose.Webcam(size, size, flip);
    webcamRef.current = webcam;

    await webcam.setup();
    await webcam.play();

    const canvas = canvasRef.current;

    if (!canvas) {
      alert("canvas를 찾을 수 없습니다.");
      return false;
    }

    canvas.width = size;
    canvas.height = size;

    ctxRef.current = canvas.getContext("2d");

    setPredictions(Array(maxPredictions).fill(""));
    setIsCameraStarted(true);

    loop();

    return true;
  };

  const loop = async () => {
    const webcam = webcamRef.current;

    if (webcam) {
      webcam.update();
      await predict();
      animationRef.current = window.requestAnimationFrame(loop);
    }
  };

  const predict = async () => {
    const model = modelRef.current;
    const webcam = webcamRef.current;

    if (!model || !webcam) return;

    const { pose, posenetOutput } = await model.estimatePose(webcam.canvas);
    const prediction = await model.predict(posenetOutput);

    const result = prediction.map((item) => {
      return `${item.className}: ${item.probability.toFixed(2)}`;
    });

    setPredictions(result);
    drawPose(pose);

    if (gameStateRef.current === 'playing') {
      checkMoveByPose(prediction);
    }
  };

  const drawPose = (pose) => {
    const tmPose = window.tmPose;
    const webcam = webcamRef.current;
    const ctx = ctxRef.current;

    if (webcam && webcam.canvas && ctx) {
      ctx.drawImage(webcam.canvas, 0, 0);

      if (pose) {
        const minPartConfidence = 0.5;
        tmPose.drawKeypoints(pose.keypoints, minPartConfidence, ctx);
        tmPose.drawSkeleton(pose.keypoints, minPartConfidence, ctx);
      }
    }
  };

  const checkMoveByPose = (prediction) => {
    const moveList = ['left', 'right', 'up', 'down'];

    const best = prediction.reduce((max, item) => {
      return item.probability > max.probability ? item : max;
    }, prediction[0]);

    if (!best) return;

    const className = best.className.trim().toLowerCase();
    const probability = best.probability;

    const isDefault =
      className.includes('default') ||
      className.includes('defalut');

    if (isDefault || probability < MOVE_THRESHOLD) {
      resetHold();
      return;
    }

    let direction = null;

    for (let dir of moveList) {
      if (className.includes(dir)) {
        direction = dir;
        break;
      }
    }

    if (!direction) {
      resetHold();
      return;
    }

    const now = Date.now();

    if (currentDirectionRef.current !== direction) {
      currentDirectionRef.current = direction;
      holdStartRef.current = now;
    }

    const holdTime = now - holdStartRef.current;

    setHoldInfo({
      direction: direction.toUpperCase(),
      percent: probability,
      time: Math.min(holdTime / 1000, 2),
    });

    if (
      holdTime >= HOLD_TIME &&
      now - lastMoveTimeRef.current >= MOVE_COOLDOWN
    ) {
      movePlayer(direction);
      lastMoveTimeRef.current = now;
      resetHold();
    }
  };

  const resetHold = () => {
    currentDirectionRef.current = null;
    holdStartRef.current = null;

    setHoldInfo({
      direction: 'None',
      percent: 0,
      time: 0,
    });
  };

  const startGame = async () => {
    const newRooms = createRooms();

    updateRooms(newRooms);
    updatePlayerPos({ x: 0, y: 0 });
    setGold(0);
    setHeart(3);
    updateHasKey(false);
    setMessage('탐험 시작! 몸을 움직여 방을 이동하세요.');
    resetHold();

    changeGameState('playing');

    const cameraReady = await initCamera();

    if (!cameraReady) {
      changeGameState('start');
    }
  };

  const createRooms = () => {
    const newRooms = {};
    const used = new Set();

    used.add('0,0');

    const getRandomPos = () => {
      let x;
      let y;
      let key;

      do {
        x = Math.floor(Math.random() * MAP_SIZE);
        y = Math.floor(Math.random() * MAP_SIZE);
        key = `${x},${y}`;
      } while (used.has(key));

      used.add(key);
      return { x, y, key };
    };

    // 5x5 맵에 맞게 보물 5개
    for (let i = 0; i < 5; i++) {
      const pos = getRandomPos();
      newRooms[pos.key] = {
        type: 'treasure',
        opened: false,
        gold: Math.floor(Math.random() * 40) + 20,
      };
    }

    // 5x5 맵에 맞게 몬스터 5마리
    for (let i = 0; i < 5; i++) {
      const pos = getRandomPos();
      newRooms[pos.key] = {
        type: 'monster',
        defeated: false,
      };
    }

    const shopPos = getRandomPos();
    newRooms[shopPos.key] = {
      type: 'shop',
      heartPrice: Math.floor(Math.random() * 31) + 40,
    };

    const keyPos = getRandomPos();
    newRooms[keyPos.key] = {
      type: 'key',
      picked: false,
    };

    const doorPos = getRandomPos();
    newRooms[doorPos.key] = {
      type: 'door',
    };

    return newRooms;
  };

  const movePlayer = (direction) => {
    const prev = playerPosRef.current;

    let nx = prev.x;
    let ny = prev.y;

    if (direction === 'left') nx--;
    if (direction === 'right') nx++;
    if (direction === 'up') ny--;
    if (direction === 'down') ny++;

    if (nx < 0 || nx >= MAP_SIZE || ny < 0 || ny >= MAP_SIZE) {
      setMessage('벽에 막혔습니다! 맵 밖으로는 나갈 수 없어요.');
      return;
    }

    const nextPos = { x: nx, y: ny };

    updatePlayerPos(nextPos);
    checkRoomEvent(nextPos);
  };

  const checkRoomEvent = (pos) => {
    const roomKey = `${pos.x},${pos.y}`;
    const room = roomsRef.current[roomKey];

    if (!room) {
      setMessage('조용한 빈 방입니다...');
      return;
    }

    if (room.type === 'treasure' && !room.opened) {
      setMessage('무언가 반짝이는 방입니다... 클릭해보세요.');
      return;
    }

    if (room.type === 'key' && !room.picked) {
      setMessage('수상한 빛이 느껴집니다... 클릭해보세요.');
      return;
    }

    if (room.type === 'shop') {
      setMessage(`상점을 발견했습니다! 클릭하면 하트를 ${room.heartPrice}골드에 구매할 수 있습니다.`);
      return;
    }

    if (room.type === 'door') {
      if (hasKeyRef.current) {
        setMessage('어딘가로 나갈 수 있을 것 같습니다... 클릭해보세요.');
      } else {
        setMessage('굳게 닫힌 무언가가 있습니다. 열쇠가 필요할 것 같습니다.');
      }
      return;
    }

    if (room.type === 'monster' && !room.defeated) {
      updateRooms((prevRooms) => ({
        ...prevRooms,
        [roomKey]: {
          ...prevRooms[roomKey],
          defeated: true,
        },
      }));

      setHeart((prevHeart) => {
        const nextHeart = prevHeart - 1;

        if (nextHeart <= 0) {
          changeGameState('over');
          setMessage('몬스터에게 당했습니다...');
          resetHold();
          return 0;
        }

        setMessage('몬스터를 만났습니다! 하트가 1개 줄었습니다.');
        return nextHeart;
      });
    }
  };

  const getCurrentRoom = () => {
    const roomKey = `${playerPos.x},${playerPos.y}`;
    return rooms[roomKey];
  };

  const handleRoomClick = () => {
    if (gameStateRef.current !== 'playing') return;

    const roomKey = `${playerPos.x},${playerPos.y}`;
    const room = roomsRef.current[roomKey];

    if (!room) {
      setMessage('여기에는 아무것도 없습니다.');
      return;
    }

    if (room.type === 'treasure') {
      if (room.opened) {
        setMessage('이미 확인한 방입니다.');
        return;
      }

      setGold((prev) => prev + room.gold);

      updateRooms((prevRooms) => ({
        ...prevRooms,
        [roomKey]: {
          ...prevRooms[roomKey],
          opened: true,
        },
      }));

      setMessage(`${room.gold} 골드를 얻었습니다!`);
      return;
    }

    if (room.type === 'shop') {
      if (heart >= 3) {
        setMessage('이미 하트가 가득 찼습니다!');
        return;
      }

      if (gold < room.heartPrice) {
        setMessage(`골드가 부족합니다! 하트 가격은 ${room.heartPrice}골드입니다.`);
        return;
      }

      setGold((prev) => prev - room.heartPrice);
      setHeart((prev) => Math.min(prev + 1, 3));

      const newPrice = Math.floor(Math.random() * 31) + 40;

      updateRooms((prevRooms) => ({
        ...prevRooms,
        [roomKey]: {
          ...prevRooms[roomKey],
          heartPrice: newPrice,
        },
      }));

      setMessage(`하트 1개를 구매했습니다! 다음 하트 가격은 ${newPrice}골드입니다.`);
      return;
    }

    if (room.type === 'key') {
      if (room.picked) {
        setMessage('이미 열쇠를 획득했습니다.');
        return;
      }

      updateHasKey(true);

      updateRooms((prevRooms) => ({
        ...prevRooms,
        [roomKey]: {
          ...prevRooms[roomKey],
          picked: true,
        },
      }));

      setMessage('열쇠를 획득했습니다! 이제 문을 찾으세요.');
      return;
    }

    if (room.type === 'door') {
      if (hasKeyRef.current) {
        changeGameState('clear');
        setMessage('GAME CLEAR! 탈출 성공!');
        resetHold();
      } else {
        setMessage('열쇠가 없어서 문을 열 수 없습니다.');
      }
      return;
    }

    if (room.type === 'monster') {
      setMessage('몬스터가 지나간 흔적만 남았습니다.');
    }
  };

  const backToStart = () => {
    changeGameState('start');
    setMessage('GAME START를 눌러 시작하세요!');
    resetHold();
  };

  const renderRoomIcon = () => {
    const room = getCurrentRoom();

    if (!room) return '🧱';

    if (room.type === 'treasure') {
      return room.opened ? '📦' : '❓';
    }

    if (room.type === 'key') {
      return room.picked ? '✨' : '❓';
    }

    if (room.type === 'shop') {
      return '❓';
    }

    if (room.type === 'door') {
      return '❓';
    }

    if (room.type === 'monster') {
      return room.defeated ? '💨' : '👾';
    }

    return '🧱';
  };

  const renderRoomTitle = () => {
    const room = getCurrentRoom();

    if (!room) return '빈 방';

    if (room.type === 'treasure') {
      return room.opened ? '빈 보물상자' : '수상한 방';
    }

    if (room.type === 'key') {
      return room.picked ? '열쇠를 얻은 방' : '수상한 방';
    }

    if (room.type === 'shop') {
      return '수상한 방';
    }

    if (room.type === 'door') {
      return '수상한 방';
    }

    if (room.type === 'monster') {
      return room.defeated ? '몬스터가 사라진 방' : '몬스터 방';
    }

    return '빈 방';
  };

  return (
    <div className="App">
      {gameState === 'start' && (
        <div className="start-screen">
          <div className="title-box">
            <h1>POSE DUNGEON</h1>
            <p>몸을 움직여 던전을 탐험하고 탈출하세요!</p>

            <div className="rule-box">
              <p>🔑 열쇠를 얻고 🚪 문을 찾아 탈출!</p>
              <p>🪙 골드로 상점에서 하트 구매 가능!</p>
              <p>포즈를 2초 유지하면 이동합니다.</p>
            </div>

            <div className="guide-box">
              <h3>포즈 설명</h3>

              <div className="pose-guide">
                <div className="pose-item">
                  <img src={`${process.env.PUBLIC_URL}/a1.jpg`} alt="왼쪽 포즈" />
                  <p>LEFT</p>
                  <span>왼손 들기</span>
                </div>

                <div className="pose-item">
                  <img src={`${process.env.PUBLIC_URL}/a2.jpg`} alt="오른쪽 포즈" />
                  <p>RIGHT</p>
                  <span>오른손 들기</span>
                </div>

                <div className="pose-item">
                  <img src={`${process.env.PUBLIC_URL}/a3.jpg`} alt="위쪽 포즈" />
                  <p>UP</p>
                  <span>양손 들기</span>
                </div>

                <div className="pose-item">
                  <img src={`${process.env.PUBLIC_URL}/a4.jpg`} alt="아래쪽 포즈" />
                  <p>DOWN</p>
                  <span>몸 낮추기</span>
                </div>
              </div>
            </div>

            <button className="start-btn" onClick={startGame}>
              GAME START
            </button>
          </div>
        </div>
      )}

      <div
        className="game-screen"
        style={{ display: gameState === 'playing' ? 'block' : 'none' }}
      >
        <div className="top-ui">
          <div className="heart-box">
            {Array.from({ length: 3 }).map((_, index) => (
              <span key={index} className={index < heart ? 'heart on' : 'heart off'}>
                ♥
              </span>
            ))}
          </div>

          <div className="stat-box">
            <span>🪙 Gold : {gold}</span>
            <span>{hasKey ? '🔑 Key : 있음' : '🔑 Key : 없음'}</span>
            <span>📍 {playerPos.x + 1} / {playerPos.y + 1}</span>
          </div>
        </div>

        <div className="main-layout">
          <div className="camera-panel">
            <h3>Pose Camera</h3>
            <canvas ref={canvasRef} id="canvas"></canvas>

            <div className="pose-info">
              <p>현재 방향 : {holdInfo.direction}</p>
              <p>확률 : {holdInfo.percent.toFixed(2)}</p>

              <div className="hold-bar">
                <div
                  className="hold-fill"
                  style={{ width: `${(holdInfo.time / 2) * 100}%` }}
                ></div>
              </div>

              <p>{holdInfo.time.toFixed(1)} / 2.0초</p>
            </div>

            <div className="prediction-list">
              {predictions.map((prediction, index) => (
                <div key={index}>{prediction}</div>
              ))}
            </div>
          </div>

          <div className="dungeon-panel">
            <div className="room-card" onClick={handleRoomClick}>
              <div className="room-icon">{renderRoomIcon()}</div>
              <h2>{renderRoomTitle()}</h2>
              <p>클릭해서 상호작용</p>
            </div>

            <div className="message-box">
              {message}
            </div>

            <div className="mini-map">
              {Array.from({ length: MAP_SIZE }).map((_, y) => (
                <div className="map-row" key={y}>
                  {Array.from({ length: MAP_SIZE }).map((_, x) => {
                    const isPlayer = playerPos.x === x && playerPos.y === y;

                    return (
                      <div
                        key={`${x},${y}`}
                        className={`map-cell ${isPlayer ? 'player-cell' : ''}`}
                      >
                        {isPlayer ? '🧍' : ''}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {gameState === 'clear' && (
        <div className="end-screen clear">
          <h1>GAME CLEAR!</h1>
          <p>탈출 성공!</p>
          <p>획득 골드 : {gold}</p>
          <button className="start-btn" onClick={backToStart}>
            GAME START로 돌아가기
          </button>
        </div>
      )}

      {gameState === 'over' && (
        <div className="end-screen over">
          <h1>GAME OVER</h1>
          <p>하트를 모두 잃었습니다...</p>
          <p>획득 골드 : {gold}</p>
          <button className="start-btn" onClick={backToStart}>
            GAME START로 돌아가기
          </button>
        </div>
      )}
    </div>
  );
}

export default App;