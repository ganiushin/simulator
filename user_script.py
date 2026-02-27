"""
  * три датчика линии (line_left / line_sensor / line_right)
  * камера (bot.camera.detect_sign())
  * моторы (bot.motors)
  * светодиодная лента (bot.leds)
  * энкодеры (bot.left_encoder / bot.right_encoder) 
  * ик‑датчик расстояния Sharp: bot.sharp
"""


def run_robot(bot):
    RED = (255, 0, 0)
    GREEN = (0, 255, 0)
    YELLOW = (255, 255, 0)
    ORANGE = (255, 165, 0)
    OFF = (0, 0, 0)

    # Стартовый цвет
    bot.leds.fill(ORANGE)
    bot.leds.write()
    yield bot.sleep(0.5)

    bot.leds.fill(GREEN)
    bot.leds.write()
    yield bot.sleep(0.5)

    bot.leds.fill(OFF)
    bot.leds.write()
    yield bot.sleep(0.5)


    while True:
        # Читаем датчики линии
        line_left = bot.line_left.read()
        line_center = bot.line_sensor.read()
        line_right = bot.line_right.read()

        # Знак от камеры (ESP32‑S3)
        sign = bot.camera.detect_sign()

        
        # Sharp: 0 = далеко, 4095 = близко (сырое значение ADC)
        sharp_val = None
        if hasattr(bot, 'sharp') and bot.sharp:
            try:
                sharp_val = bot.sharp.read()
            except Exception:
                sharp_val = None

        # Порог для линии — подбирается по месту
        on_left = line_left < 3500
        on_center = line_center < 3500
        on_right = line_right < 3500

        # 1. Реакция на близкую преграду по Sharp (4095 = очень близко)
        if sharp_val is not None and sharp_val >= 4095:
            print(f"Sharp obstacle very close: {sharp_val}")
            bot.leds.fill(RED)
            bot.leds.write()
            bot.motors.stop()
            yield bot.sleep(0.3)
            bot.motors.move(-40, -40)
            yield bot.sleep(0.4)
            bot.motors.move(-30, 30)
            yield bot.sleep(0.3)
            bot.leds.fill(OFF)
            bot.leds.write()
            continue

        # 2. Реакция на знаки
        if sign == "STOP":
            print("STOP sign")
            bot.leds.fill(RED)
            bot.leds.write()
            bot.motors.stop()
            yield bot.sleep(2.0)
            bot.leds.fill(OFF)
            bot.leds.write()
            continue

        elif sign == "GO":
            print("GO sign -> forward")
            bot.leds.fill(GREEN)
            bot.leds.write()
            bot.motors.move(50, 50)
            yield bot.sleep(1.5)
            bot.leds.fill(OFF)
            bot.leds.write()
            

        elif sign == "LEFT":
            print("LEFT turn sign")
            bot.leds.fill(YELLOW)
            bot.leds.write()
            bot.motors.move(40, -40)
            yield bot.sleep(0.5)
            bot.leds.fill(OFF)
            bot.leds.write()
            continue

        elif sign == "RIGHT":
            print("RIGHT turn sign")
            bot.leds.fill(YELLOW)
            bot.leds.write()
            bot.motors.move(-40, 40)
            yield bot.sleep(0.5)
            bot.leds.fill(OFF)
            bot.leds.write()
            continue

        # 3. Логика по линии (простая P-подобная)
        if on_left and on_right:
            # оба датчика видят линию — вероятно перекресток / развилка
            print("Both line sensors on black -> stop briefly")
            bot.motors.stop()
            yield bot.sleep(0.3)

        elif on_left:
            # линия слева — поворачиваем влево
            bot.motors.move(-10, 10)

        elif on_right:
            # линия справа — поворачиваем вправо
            bot.motors.move(10, -10)

        else:
            # центр или ничего — едем прямо
            bot.motors.move(30, 30)

        # 3. Небольшая пауза, чтобы не грузить CPU
        yield bot.sleep(0.05)

