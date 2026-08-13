import * as CANNON from 'cannon-es';

export class PhysicsWorld {
  constructor() {
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    
    // Algoritmo de Broadphase mais preciso para colisões rápidas
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.allowSleep = true;

    this.defaultMaterial = new CANNON.Material('default');
    
    // Configura o material de contato para evitar penetração nas paredes
    this.world.defaultContactMaterial = new CANNON.ContactMaterial(
      this.defaultMaterial,
      this.defaultMaterial,
      { 
        friction: 0.2, 
        restitution: 0.05, // Pequena repulsão elástica para afastar da parede na colisão
        contactEquationStiffness: 1e7, // Alta rigidez do contato (não deixa afundar)
        contactEquationRelaxation: 3
      }
    );
    this.world.addContactMaterial(this.world.defaultContactMaterial);

    this._synced = [];
  }

  step(delta) {
    // Aumentado substepping para 10 para garantir precisão em velocidades mais altas
    this.world.step(1 / 60, delta, 10);
    for (const { body, mesh, offsetY } of this._synced) {
      mesh.position.set(body.position.x, body.position.y + offsetY, body.position.z);
      
      if (!body.fixedRotation) {
        mesh.quaternion.copy(body.quaternion);
      }
    }
  }

  link(body, mesh, offsetY = 0) {
    this._synced.push({ body, mesh, offsetY });
  }

  addGroundPlane() {
    const body = new CANNON.Body({ mass: 0, material: this.defaultMaterial });
    body.addShape(new CANNON.Plane());
    body.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    this.world.addBody(body);
    return body;
  }

  addStaticBox(size, position, rotationY = 0) {
    const shape = new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2));
    const body = new CANNON.Body({ mass: 0, material: this.defaultMaterial });
    body.addShape(shape);
    body.position.set(position.x, position.y, position.z);
    body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), rotationY);
    this.world.addBody(body);
    return body;
  }

  addStaticCylinder(radius, height, position) {
    const shape = new CANNON.Cylinder(radius, radius, height, 12);
    const body = new CANNON.Body({ mass: 0, material: this.defaultMaterial });
    body.addShape(shape);
    body.position.set(position.x, position.y, position.z);
    this.world.addBody(body);
    return body;
  }

  addPlayerBody(radius, height, position) {
    const body = new CANNON.Body({
      mass: 70,
      material: this.defaultMaterial,
      fixedRotation: true,
      linearDamping: 0.9,
    });
    const cylH = Math.max(height - radius * 2, 0.1);
    body.addShape(new CANNON.Cylinder(radius, radius, cylH, 8));
    body.addShape(new CANNON.Sphere(radius), new CANNON.Vec3(0, cylH / 2, 0));
    body.addShape(new CANNON.Sphere(radius), new CANNON.Vec3(0, -cylH / 2, 0));
    body.position.set(position.x, position.y + height / 2, position.z);
    this.world.addBody(body);
    return body;
  }
}