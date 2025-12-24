//백업 2025-12-22 app.jsx
import { useState, useEffect } from 'react'
import TodoItem from './components/TodoItem';

// todos 서버
const BASE_URL = 'http://localhost:4000/todos'; 

function App() {
  const [todo, setTodo] = useState('');
  const [todos, setTodos] = useState([]);
  const [filter, setFilter] = useState("all");

  useEffect(()=>{
    const fetchTodos = async () => {
      const res = await fetch(`${BASE_URL}`);
      const data = await res.json();
      setTodos(data);
    }
    fetchTodos()
  }, [])

  const handleChange = (e) => setTodo(e.target.value);

  const addTodo = async () => {
    const res = await fetch(`${BASE_URL}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: todo,
        completed: false,
      }),
    });
    const newTodo = await res.json();
    setTodos((prev) => [...prev, newTodo]);
    setTodo(""); 
  };

  const onDelete = async (id) => {
    await fetch(`${BASE_URL}/${id}`, {
      method: "DELETE", 
    });
    setTodos((prev)=> prev.filter((t)=> t.id !== id ))
  }
  
 const onToggle = async (todo) => {
  console.log("onToggle : ", todo);
  const res = await fetch(`${BASE_URL}/${todo.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ completed: !todo.completed }),
  });
  const updated = await res.json();
  setTodos((prev) => prev.map((t) => (t.id === todo.id ? updated : t)));
  }
 
  const filteredTodos = todos.filter((t)=>{
    if(filter === "completed") return t.completed;
    if(filter === "uncompleted") return !t.completed;
    return true;
  })

  return (
    <div>
      <h1>초등 스터디 플래너</h1>
      <div>2025-12-25</div>
      <div>날씨</div>
      <div>제영이</div>
      <div class="goal">★오늘의 다짐★
        <input type="text" placeholder='빨리 숙제 끝내고 놀자!'/>
      </div>
      {/* <div>오늘의 할일</div> */}

      <div className="todo-bar">
        <button className="btn-primary">↓ 겨울방학 숙제 불러오기</button>
        <input
          value={todo}
          onChange={handleChange}
          placeholder="새로운 내용 입력"
          className="todo-input"
        />
        <button onClick={addTodo} className="btn-outline">입력</button>
      </div>

{/* 
      <div>
        <button>겨울방학 숙제 불러오기</button>
        <input value={todo} onChange={handleChange} placeholder='할일 입력'/>
        <button onClick={addTodo}>입력</button>
      </div> */}

      <ul>
        {filteredTodos.map((t)=>
          <TodoItem key={t.id}
            t={t}
            onToggle={onToggle}
            onDelete={onDelete}
          />
       )}
      </ul>

      <div class="fillter">
        <button onClick={()=>setFilter("all")}>전체</button>
        <button onClick={()=>setFilter("completed")}>완료</button>
        <button onClick={()=>setFilter("uncompleted")}>미완료</button>
      </div>

      <div class="finish">
        공부 다하면?
        <input type="text" placeholder='레고하기~'/>
      </div>
      <div class="stopwatch">
        <span>스탑워치</span>
        <span>00:00:00</span> 
        <button>시작</button>
        <button>정지</button>
        <button>리셋</button>
      </div>

    </div>
  )
}

export default App