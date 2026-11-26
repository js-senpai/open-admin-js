import { ArgumentsHost,Catch,ExceptionFilter,HttpException } from "@nestjs/common";
type Response = { headersSent:boolean; status(code:number):Response; json(body:unknown):void; getHeader(name:string):unknown };
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception:unknown,host:ArgumentsHost) {
    if(host.getType()!=="http") throw exception;
    const res=host.switchToHttp().getResponse<Response>();
    if(res.headersSent) return;
    let status=500,code="INTERNAL_ERROR",message:unknown="Internal request failure";
    let details:unknown;
    if(exception instanceof HttpException){
      status=exception.getStatus();
      const body=exception.getResponse();
      const obj=typeof body==="object"&&body!==null?body as Record<string,unknown>:null;
      if(status<500){code=typeof obj?.code==="string"?obj.code:"HTTP_"+status;message=obj?.message??body;details=obj?.details;}
    }else if(exception&&typeof exception==="object"&&"code" in exception){
      const p=(exception as {code:unknown}).code;
      if(p==="P2002"||p==="P2003"){status=409;code="CONFLICT";message="Record conflicts with existing data";}
      if(p==="P2025"){status=404;code="NOT_FOUND";message="Record not found";}
    }
    res.status(status).json({statusCode:status,code,message,requestId:res.getHeader("x-request-id"),...(details===undefined?{}:{details})});
  }
}
