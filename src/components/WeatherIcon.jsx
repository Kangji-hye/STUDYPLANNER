// src/components/WeatherIcon.jsx
const iconMap = {
  clear: "/weather/sun.svg",
  cloudy: "/weather/cloud.svg",
  rain: "/weather/rain.svg",
  snow: "/weather/snow.svg",
  thunder: "/weather/thunder.svg",
};

const pickIcon = (code) => {
  if (code === 0) return iconMap.clear;
  if ([1, 2, 3].includes(code)) return iconMap.cloudy;
  if ([61, 63, 65, 80, 81, 82].includes(code)) return iconMap.rain;
  if ([71, 73, 75].includes(code)) return iconMap.snow;
  if ([95, 96, 99].includes(code)) return iconMap.thunder;
  return iconMap.cloudy;
};

const WeatherIcon = ({ code, size = 52 }) => {
  if (code == null) return null;

  return (
    <img
      src={pickIcon(code)}
      alt="weather"
      style={{ width: size, height: size }}
    />
  );
};

export default WeatherIcon;
