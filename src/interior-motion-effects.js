const INTERIOR_EFFECT_FUNCTIONS = `
  float interiorArea(vec2 uv,vec2 low,vec2 high,float feather){
    vec2 a=smoothstep(low,low+feather,uv),b=1.0-smoothstep(high-feather,high,uv);
    return a.x*a.y*b.x*b.y;
  }
  float interiorLife(){return interiorStrength*smoothstep(0.0,.9,interiorTime);}
  vec2 interiorScreenUv(vec2 uv,float kind,int axis,float side,float seed){
    if(axis!=0 || interiorLife()<=0.0)return uv;
    vec2 sampleUv=uv;


    if(kind>2.5 && kind<3.5 && side>.5){
      bool viewport=uv.x>=.025 && uv.x<=.975 && uv.y>=.025 && uv.y<=.88;
      if(viewport){
        float scroll=.11*(.5-.5*cos(interiorTime*.48+seed*.53))*interiorLife();
        sampleUv=uv-vec2(0.0,scroll);


        if(sampleUv.y<.025 || sampleUv.y>.88)sampleUv=vec2(.04,.50);
      }
    }
    return sampleUv;
  }
  vec3 interiorScreen(vec3 color,vec2 uv,float kind,int axis,float side,float seed){
    float life=interiorLife();
    if(axis!=0 || life<=0.0)return color;
    float area=interiorArea(uv,vec2(.085,.075),vec2(.915,.925),.015);
    float clock=interiorSignal.w>.5?interiorSignal.x:interiorTime;
    float energy=interiorSignal.y*interiorSignal.z;
    if(kind<1.5 && kind>.5){

      float progress=fract(interiorTime*.075+seed*.19);
      float line=1.0-smoothstep(.002,.014,abs(uv.x-(.1+.8*progress)));
      float preview=interiorArea(uv,vec2(.14,.19),vec2(.86,.77),.018);
      color+=vec3(.12,.17,.21)*line*preview*life;
      float bar=interiorArea(uv,vec2(.13,.09),vec2(.13+.72*progress,.105),.003);
      color=mix(color,vec3(.36,.54,.64),bar*life*.75);
    }else if(kind>1.5 && kind<2.5){

      float playhead=.12+.76*fract(clock/8.0);
      float line=1.0-smoothstep(.002,.01,abs(uv.x-playhead));
      float tracks=interiorArea(uv,vec2(.1,.20),vec2(.9,.81),.012);
      color=mix(color,vec3(.82,.91,.91),line*tracks*.8*life);
      float column=floor(uv.x*18.0),barX=fract(uv.x*18.0);
      float height=.035+energy*(.035+.055*(.5+.5*sin(column*2.1+clock*3.0)));
      float meter=step(.2,barX)*(1.0-step(.72,barX))*step(.105,uv.y)*(1.0-smoothstep(.105+height,.117+height,uv.y));
      color=mix(color,vec3(.56,.72,.56),meter*life*.78);
    }else if(kind>2.5 && kind<3.5 && side>.5){
      vec2 cursor=vec2(.30+.23*sin(interiorTime*.46+seed),.39+.14*sin(interiorTime*.71+seed*.37));
      float distance=length((uv-cursor)*vec2(1.0,.8));
      float pointer=1.0-smoothstep(.006,.018,distance);
      float click=fract(interiorTime*.23+seed*.13);
      float ring=(1.0-smoothstep(.004,.009,abs(distance-(.025+.07*click))))*(1.0-click);
      color=mix(color,vec3(.04,.07,.12),pointer*area*life);
      color=mix(color,vec3(.22,.43,.83),ring*area*life*.55);

      float tab=.2+.58*(.5+.5*sin(interiorTime*.37+seed));
      float focus=interiorArea(uv,vec2(tab-.06,.835),vec2(tab+.06,.85),.005);
      color=mix(color,vec3(.23,.43,.78),focus*life*.72);
    }else if(kind>5.5 && kind<6.5){

      float segments=step(.22,fract(uv.y*14.0))*(1.0-step(.72,fract(uv.y*14.0)));
      float level=step(uv.y,.23+.55*energy);
      float strip=interiorArea(uv,vec2(.83,.20),vec2(.875,.80),.008);
      color=mix(color,vec3(.61,.48,.29),strip*segments*(.12+.68*level)*life);
    }else if(kind>6.5 && kind<7.5){
      float row=floor(uv.y*10.0),fraction=fract(uv.y*10.0);
      float meterHeight=.08+energy*(.38+.28*(.5+.5*sin(row*1.7+clock*2.2)));
      float lights=step(.3,fraction)*(1.0-step(.61,fraction))*step(.17,uv.x)*(1.0-smoothstep(.17+meterHeight,.19+meterHeight,uv.x));
      float zone=interiorArea(uv,vec2(.65,.13),vec2(.88,.87),.012);
      color=mix(color,vec3(.65,.47,.24),lights*zone*life*.62);
    }else if(kind>9.5 && kind<10.5){
      float row=floor(uv.y*13.0),x=fract(uv.x*9.0);
      float activity=.45+.55*sin(row*2.6+seed+interiorTime*1.6);
      float dots=step(.3,x)*(1.0-step(.42,x))*step(.42,fract(uv.y*13.0))*(1.0-step(.53,fract(uv.y*13.0)));
      color+=vec3(.035,.10,.13)*dots*max(0.0,activity)*area*life;
    }
    return color;
  }
  vec3 interiorRoomLight(vec3 color,vec3 hit,vec3 normal,float kind){
    float life=interiorLife();if(life<=0.0)return color;
    vec3 p=(hit-interiorMinimum)/max(interiorSize,vec3(.001));
    if(interiorProfile<1.5){

      float position=.5+.34*sin(interiorTime*.29+interiorFloor*.7);
      float band=exp(-pow((p.z-position)*5.5+(p.y-.5)*.55,2.0));
      float grazing=.25+.75*abs(normal.x);
      float reflection=kind>4.5&&kind<5.5?pow(band,3.0)*.13:0.0;
      color+=life*(color*.13*band*grazing+vec3(.018,.029,.041)*band*grazing+vec3(.10,.13,.16)*reflection);
    }else if(interiorProfile<2.5){
      float energy=interiorSignal.y*interiorSignal.z;
      float wash=exp(-pow((p.z-(.5+.22*sin(interiorTime*.19)))*3.0,2.0));
      float edge=smoothstep(.58,.97,p.y);
      color+=vec3(.029,.016,.006)*wash*(.25+energy*.75)*edge*life;
    }else if(interiorProfile<3.5){

      float wash=exp(-pow((p.z-(.5+.34*sin(interiorTime*.21)))*4.0,2.0));
      color+=vec3(.008,.014,.022)*wash*abs(normal.x)*life;
    }else{
      float wash=.5+.5*sin(p.z*3.8-interiorTime*.32);
      color+=vec3(.020,.012,.005)*wash*smoothstep(.18,.85,p.y)*life;
    }
    return color;
  }
`;
export {
  INTERIOR_EFFECT_FUNCTIONS
};
