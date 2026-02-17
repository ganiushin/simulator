def run_robot(bot):
    """Логика робота. Используем yield для неблокирующих задержек."""
    #
    # Краткая шпаргалка по объекту `bot`:
    #
    # ДВИЖЕНИЕ:
    #   bot.motors.move(left, right)   # скорость -100..100, отрицательные — назад
    #       bot.motors.move(30, 30)    # ехать вперёд прямо
    #       bot.motors.move(40, -40)   # поворот направо на месте
    #       bot.motors.stop()          # остановить оба мотора
    #
    # КНОПКА:
    #   bot.button.is_pressed() -> bool
    #       while not bot.button.is_pressed():
    #           yield bot.sleep(0.1)  # Используем yield для задержки!
    #
    # СВЕТОДИОДНАЯ ЛЕНТА (4 диода):
    #   bot.leds.fill((R, G, B))       # задать цвет всем
    #   bot.leds[0] = (255, 0, 0)      # отдельный светодиод
    #   bot.leds.write()               # отправить данные на ленту
    #
    # ЛИНИЯ (3 датчика):
    #   bot.line_left.read()   -> 0..4095
    #   bot.line_sensor.read() -> 0..4095 (центр)
    #   bot.line_right.read()  -> 0..4095
    #       if bot.line_left.read() > 1500:
    #           bot.motors.move(-10, 10)   # отъехать от левой линии
    #
    # УЛЬТРАЗВУКОВОЙ ДАЛЬНОМЕР:
    #   bot.ultrasonic.distance_cm()  -> число (см)
    #       if bot.ultrasonic.distance_cm() < 20:
    #           bot.motors.stop()
    #
    # ФОТОРЕЗИСТОР:
    #   bot.photoresistor.read() -> 0..4095
    #       if bot.photoresistor.read() > 1500:
    #           bot.leds.fill((255, 255, 255))
    #           bot.leds.write()
    #
    # SHARP (ИК-датчик расстояния):
    #   bot.sharp.read() -> 0..4095
    #
    # СЕРВОПРИВОД:
    #   bot.servo.set_angle(deg)   # угол 0..180
    #       bot.servo.set_angle(90)
    #
    # ВИЗУАЛЬНЫЕ ЗНАКИ:
    #   bot.camera.detect_sign() -> "STOP" / "GREEN" / "LEFT" / "RIGHT" / None
    #       sign = bot.camera.detect_sign()
    #       if sign == "GREEN":
    #           bot.motors.move(50, 50)
    #
    # ЭНКОДЕРЫ КОЛЁС (только чтение):
    #   bot.left_encoder.read()  -> тики
    #   bot.right_encoder.read() -> тики
    #
    # ВРЕМЯ / ЗАДЕРЖКА:
    #   yield bot.sleep(seconds)  # Используем yield для задержки!
    #       yield bot.sleep(0.1)
    
    RED = (255, 0, 0)
    GREEN = (0, 255, 0)
    BLUE = (0, 0, 200)
    YELLOW = (255, 255, 0)
    WHITE = (255, 255, 255)
    ORANGE = (255, 165, 0)
    
    print("Robot Program Started!")

    bot.leds.fill(ORANGE)
    bot.leds.write()

    
    print("Waiting for button...")
    while not bot.button.is_pressed():
        yield bot.sleep(0.1)  # Используем yield для задержки!
        
    if hasattr(bot, 'overlay_message'):
        bot.overlay_message = None
        
    print("GO!")
    bot.leds.fill(GREEN)
    bot.leds.write()
    yield bot.sleep(0.5)  # Используем yield для задержки!

    stopped_at_sign = False
    
    while True:
        line_left = bot.line_left.read()
        line_center = bot.line_sensor.read()
        line_right = bot.line_right.read()
        sign = bot.camera.detect_sign()
        dist = bot.ultrasonic.distance_cm()
        light = bot.photoresistor.read()
        
        # тут детекции с камеры
        if sign == "STOP":
            print("STOP Sign Detected!")
            bot.leds.fill(RED)
            bot.leds.write()
            bot.motors.stop()
            yield bot.sleep(3.0)  
            bot.motors.move(40, 40)
            yield bot.sleep(1.0)  
            continue
            
        elif sign == "GREEN":
            print("GREEN Sign - Moderate Speed!")
            bot.leds.fill(GREEN)
            bot.leds.write()
            bot.motors.move(50, 50)
            yield bot.sleep(5)  
            continue
            
        elif sign == "RIGHT":
            print("RIGHT Turn!")
            bot.leds.fill(YELLOW)
            bot.leds.write()
            bot.motors.move(40, 40)
            yield bot.sleep(0.5)  
            bot.motors.move(50, 0)
            yield bot.sleep(0.65)  
            bot.motors.move(35, 35)
            yield bot.sleep(0.3)  
            continue
            
        elif sign == "LEFT":
            print("LEFT Turn!")
            bot.leds.fill(YELLOW)
            bot.leds.write()
            bot.motors.move(40, 40)
            yield bot.sleep(0.5)  
            bot.motors.move(0, 50)
            yield bot.sleep(0.65)  
            bot.motors.move(35, 35)
            yield bot.sleep(0.3)  
            continue
        
        # сонар
        if dist < 20:
            print(f"Obstacle! Distance: {dist:.1f} cm")
            bot.leds.fill(BLUE)
            bot.leds.write()
            bot.motors.stop()
            yield bot.sleep(0.3)  
            bot.motors.move(-40, -40) 
            yield bot.sleep(0.5)  
            bot.motors.move(50, -50)  
            yield bot.sleep(0.7) 
            bot.motors.move(50, 50)   
            yield bot.sleep(0.8)  
            bot.motors.move(-50, 50)   
            yield bot.sleep(0.7)  
            continue
        
        # фоторезистор
        if light > 1500:
            print(f"Bright light! Level: {light}")
            bot.leds.fill(WHITE)
            bot.leds.write()
        elif sign is None and dist > 20:
            bot.leds.fill(GREEN)
            bot.leds.write()
        
        # едем в полосе
        left_on_black = line_left > 1500
        right_on_black = line_right > 1500
        
        # стак
        if left_on_black and right_on_black:
            print("CRITICAL: All sensors on black! Backing up...")
            bot.leds.fill(RED)
            bot.leds.write()
            bot.motors.move(-40, -40)
            yield bot.sleep(0.6)  
            bot.motors.move(-50, 50)
            yield bot.sleep(0.4)  
            continue

        if left_on_black:
            bot.motors.move(10, -10)
        elif right_on_black:
            bot.motors.move(-10, 10)
        else:
            bot.motors.move(30, 30)
            
        # на всякий случай что бы не грузить микроконтроллер
        yield bot.sleep(0.05)  
