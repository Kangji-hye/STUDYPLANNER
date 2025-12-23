import { useState, useEffect } from 'react'
import TodoItem from './components/TodoItem';

// todos 서버
const BASE_URL = 'http://localhost:4000/todos'; 

function App() {
  const [todo, setTodo] = useState('');
  const [todos, setTodos] = useState([])
  const [filter, setFilter] = useState("all");

  // todos 가져오기
  useEffect(() => {
    const fetchTodos = async () => {
      const res = await fetch(`${BASE_URL}`);
      const data = await res.json();
      setTodos(data);
      };
    fetchTodos();
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
      <input value={todo} onChange={handleChange} placeholder='할일 입력'/>
      <button onClick={addTodo}>입력</button>

      <ul>
        {filteredTodos.map((t)=>
          <TodoItem key={t.id}
            t={t}
            onToggle={onToggle}
            onDelete={onDelete}
          />
       )}
      </ul>

      <button onClick={()=>setFilter("all")}>전체</button>
      <button onClick={()=>setFilter("completed")}>완료</button>
      <button onClick={()=>setFilter("uncompleted")}>미완료</button>

    </div>
  )
}

export default App
